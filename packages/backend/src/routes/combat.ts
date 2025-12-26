import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { UNIT_DATA, calculateDistance, calculateTravelTime, GAME_CONFIG } from '@travian/shared';
import type { AttackType } from '@travian/shared';

const router = Router();

// Get target village info (for attacking)
router.get('/target/:x/:y', async (req: AuthRequest, res: Response) => {
  try {
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    const targetVillage = await prisma.village.findUnique({
      where: { xCoord_yCoord: { xCoord: x, yCoord: y } },
      include: {
        user: { select: { username: true, tribe: true } },
      },
    });

    if (!targetVillage) {
      return res.status(404).json({ success: false, error: 'No village at these coordinates' });
    }

    // Get attacker's village for distance calculation
    const attackerVillage = await prisma.village.findFirst({
      where: { userId: req.userId },
    });

    if (!attackerVillage) {
      return res.status(404).json({ success: false, error: 'You have no village' });
    }

    const distance = calculateDistance(
      attackerVillage.xCoord,
      attackerVillage.yCoord,
      x,
      y
    );

    const isOwnVillage = targetVillage.userId === req.userId;

    res.json({
      success: true,
      data: {
        village: {
          id: targetVillage.id,
          name: targetVillage.name,
          coordinates: { x, y },
          population: targetVillage.population,
          ownerName: targetVillage.user.username,
          ownerTribe: targetVillage.user.tribe,
          isOwnVillage,
        },
        distance: Math.round(distance * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error fetching target:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch target' });
  }
});

// Send attack/raid
router.post('/attack', async (req: AuthRequest, res: Response) => {
  try {
    const { fromVillageId, toX, toY, troops, attackType, targetBuilding } = req.body;

    if (!fromVillageId || toX === undefined || toY === undefined || !troops || !attackType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!['attack', 'raid', 'reinforcement', 'scout', 'conquest'].includes(attackType)) {
      return res.status(400).json({ success: false, error: 'Invalid attack type' });
    }

    // Validate troops array
    if (!Array.isArray(troops) || troops.length === 0) {
      return res.status(400).json({ success: false, error: 'No troops selected' });
    }

    // Get attacker village
    const attackerVillage = await prisma.village.findFirst({
      where: { id: fromVillageId, userId: req.userId },
      include: {
        troops: { where: { status: 'home' } },
        user: { select: { tribe: true } },
      },
    });

    if (!attackerVillage) {
      return res.status(404).json({ success: false, error: 'Attacker village not found' });
    }

    // Get target village
    const targetVillage = await prisma.village.findUnique({
      where: { xCoord_yCoord: { xCoord: toX, yCoord: toY } },
    });

    if (!targetVillage) {
      return res.status(404).json({ success: false, error: 'Target village not found' });
    }

    // Can't attack own village (unless it's a reinforcement)
    if (targetVillage.userId === req.userId && attackType !== 'reinforcement') {
      return res.status(400).json({ success: false, error: 'Cannot attack your own village' });
    }

    // Can only reinforce own village
    if (targetVillage.userId !== req.userId && attackType === 'reinforcement') {
      return res.status(400).json({ success: false, error: 'Can only reinforce your own villages' });
    }

    // Validate troop availability
    for (const troopOrder of troops) {
      const { unitType, quantity } = troopOrder;
      if (quantity < 1) continue;

      const availableTroop = attackerVillage.troops.find(
        (t) => t.unitType === unitType && t.status === 'home'
      );

      if (!availableTroop || availableTroop.quantity < quantity) {
        return res.status(400).json({
          success: false,
          error: `Not enough ${unitType} available`,
        });
      }
    }

    // Calculate travel time based on slowest unit
    let slowestSpeed = Infinity;
    const validTroops: { unitType: string; quantity: number }[] = [];

    for (const troopOrder of troops) {
      if (troopOrder.quantity < 1) continue;

      const unitData = UNIT_DATA[troopOrder.unitType];
      if (!unitData) continue;

      validTroops.push(troopOrder);
      if (unitData.speed < slowestSpeed) {
        slowestSpeed = unitData.speed;
      }
    }

    if (validTroops.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid troops selected' });
    }

    const distance = calculateDistance(
      attackerVillage.xCoord,
      attackerVillage.yCoord,
      toX,
      toY
    );

    // Calculate Tournament Square speed bonus (for distances > 20)
    let speedBonus = 0;
    if (distance > 20 && attackType !== 'reinforcement') {
      const tournamentSquare = await prisma.building.findFirst({
        where: {
          villageId: fromVillageId,
          type: 'tournament_square',
        },
      });
      if (tournamentSquare && tournamentSquare.level > 0) {
        // 1% speed bonus per level (max 20%)
        speedBonus = tournamentSquare.level / 100;
      }
    }

    // Calculate Horse Drinking Trough bonus for Romans (cavalry units only)
    let horseTroughBonus = 0;
    if (attackerVillage.user.tribe === 'romans') {
      const cavalryUnits = ['equites_legati', 'equites_imperatoris', 'equites_caesaris'];
      const hasCavalry = validTroops.some(t => cavalryUnits.includes(t.unitType));

      if (hasCavalry) {
        const horseTrough = await prisma.building.findFirst({
          where: {
            villageId: fromVillageId,
            type: 'horse_drinking_trough',
          },
        });
        if (horseTrough && horseTrough.level > 0) {
          // 1% speed bonus per level for cavalry
          horseTroughBonus = horseTrough.level / 100;
        }
      }
    }

    const effectiveSpeed = slowestSpeed * (1 + speedBonus + horseTroughBonus);
    const travelTime = calculateTravelTime(distance, effectiveSpeed);
    const now = new Date();
    const arrivesAt = new Date(now.getTime() + travelTime * 1000);

    // Check if this is a conquest attack (contains chiefs/senators)
    const conquestUnits = ['senator', 'chief', 'chieftain'];
    const isConquest =
      attackType === 'conquest' ||
      validTroops.some((t) => conquestUnits.includes(t.unitType));

    // Validate conquest attack
    if (isConquest) {
      // Can't conquer own village
      if (targetVillage.userId === req.userId) {
        return res.status(400).json({ success: false, error: 'Cannot conquer your own village' });
      }

      // Can't conquer capital village
      if (targetVillage.isCapital) {
        return res.status(400).json({ success: false, error: 'Cannot conquer a capital village' });
      }
    }

    // Create attack and update troops in transaction
    await prisma.$transaction(async (tx) => {
      // Deduct troops from village
      for (const troopOrder of validTroops) {
        const existingTroop = attackerVillage.troops.find(
          (t) => t.unitType === troopOrder.unitType
        );

        if (existingTroop) {
          const newQuantity = existingTroop.quantity - troopOrder.quantity;
          if (newQuantity <= 0) {
            await tx.troop.delete({ where: { id: existingTroop.id } });
          } else {
            await tx.troop.update({
              where: { id: existingTroop.id },
              data: { quantity: newQuantity },
            });
          }
        }
      }

      // Create attacking/reinforcing troop entries
      const troopStatus = attackType === 'reinforcement' ? 'reinforcing' : 'attacking';
      for (const troopOrder of validTroops) {
        await tx.troop.create({
          data: {
            villageId: fromVillageId,
            unitType: troopOrder.unitType,
            quantity: troopOrder.quantity,
            status: troopStatus,
            destinationVillageId: targetVillage.id,
            arrivesAt,
          },
        });
      }

      // For reinforcements, schedule arrival job instead of attack resolution
      if (attackType === 'reinforcement') {
        await tx.gameJob.create({
          data: {
            type: 'reinforcement_arrive',
            villageId: targetVillage.id,
            data: JSON.stringify({
              fromVillageId,
              toVillageId: targetVillage.id,
              troops: validTroops,
            }),
            scheduledFor: arrivesAt,
          },
        });
      } else {
        // Create attack record for attacks/raids/scouts/conquest
        await tx.attack.create({
          data: {
            attackerVillageId: fromVillageId,
            defenderVillageId: targetVillage.id,
            attackType: attackType as AttackType,
            troops: JSON.stringify(validTroops),
            targetBuilding: targetBuilding || null,
            isConquest,
            arrivesAt,
          },
        });

        // Schedule attack resolution job
        await tx.gameJob.create({
          data: {
            type: 'attack_resolve',
            villageId: targetVillage.id,
            data: JSON.stringify({
              attackerVillageId: fromVillageId,
              defenderVillageId: targetVillage.id,
              attackType,
            }),
            scheduledFor: arrivesAt,
          },
        });
      }
    });

    res.json({
      success: true,
      data: {
        attackType,
        troops: validTroops,
        arrivesAt: arrivesAt.toISOString(),
        travelTime,
        distance: Math.round(distance * 10) / 10,
      },
    });
  } catch (error) {
    console.error('Error sending attack:', error);
    res.status(500).json({ success: false, error: 'Failed to send attack' });
  }
});

// Get incoming attacks
router.get('/incoming/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const incomingAttacks = await prisma.attack.findMany({
      where: {
        defenderVillageId: villageId,
        resolved: false,
      },
      include: {
        attackerVillage: {
          select: { name: true, xCoord: true, yCoord: true },
        },
      },
      orderBy: { arrivesAt: 'asc' },
    });

    const attacks = incomingAttacks.map((attack) => ({
      id: attack.id,
      attackType: attack.attackType,
      from: {
        name: attack.attackerVillage.name,
        coordinates: {
          x: attack.attackerVillage.xCoord,
          y: attack.attackerVillage.yCoord,
        },
      },
      arrivesAt: attack.arrivesAt,
    }));

    res.json({
      success: true,
      data: { attacks },
    });
  } catch (error) {
    console.error('Error fetching incoming attacks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch incoming attacks' });
  }
});

// Get outgoing attacks
router.get('/outgoing/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const outgoingAttacks = await prisma.attack.findMany({
      where: {
        attackerVillageId: villageId,
        resolved: false,
      },
      include: {
        defenderVillage: {
          select: { name: true, xCoord: true, yCoord: true },
        },
      },
      orderBy: { arrivesAt: 'asc' },
    });

    const attacks = outgoingAttacks.map((attack) => ({
      id: attack.id,
      attackType: attack.attackType,
      troops: JSON.parse(attack.troops),
      to: {
        name: attack.defenderVillage.name,
        coordinates: {
          x: attack.defenderVillage.xCoord,
          y: attack.defenderVillage.yCoord,
        },
      },
      arrivesAt: attack.arrivesAt,
    }));

    res.json({
      success: true,
      data: { attacks },
    });
  } catch (error) {
    console.error('Error fetching outgoing attacks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch outgoing attacks' });
  }
});

// Recall reinforcements
router.post('/recall/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    // Verify ownership
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Find reinforcing troops from this village
    const reinforcingTroops = await prisma.troop.findMany({
      where: {
        villageId: { not: villageId },
        originalOwnerId: villageId,
        status: 'home',
      },
    });

    if (reinforcingTroops.length === 0) {
      return res.status(400).json({ success: false, error: 'No reinforcements to recall' });
    }

    // Group by destination village for travel time calculation
    const troopsByDestination = reinforcingTroops.reduce((acc, troop) => {
      if (!acc[troop.villageId]) {
        acc[troop.villageId] = [];
      }
      acc[troop.villageId].push(troop);
      return acc;
    }, {} as Record<string, typeof reinforcingTroops>);

    await prisma.$transaction(async (tx) => {
      for (const [destVillageId, troops] of Object.entries(troopsByDestination)) {
        const destVillage = await tx.village.findUnique({
          where: { id: destVillageId },
        });

        if (!destVillage) continue;

        // Calculate return time
        const distance = calculateDistance(
          village.xCoord,
          village.yCoord,
          destVillage.xCoord,
          destVillage.yCoord
        );

        // Find slowest unit
        let slowestSpeed = Infinity;
        for (const troop of troops) {
          const unitData = UNIT_DATA[troop.unitType];
          if (unitData && unitData.speed < slowestSpeed) {
            slowestSpeed = unitData.speed;
          }
        }

        const returnTime = calculateTravelTime(distance, slowestSpeed);
        const returnsAt = new Date(Date.now() + returnTime * 1000);

        // Update troops to returning status
        for (const troop of troops) {
          await tx.troop.update({
            where: { id: troop.id },
            data: {
              status: 'returning',
              destinationVillageId: villageId,
              arrivesAt: returnsAt,
            },
          });
        }

        // Schedule return job
        await tx.gameJob.create({
          data: {
            type: 'troops_return',
            villageId,
            data: JSON.stringify({
              returningFrom: destVillageId,
              plunder: { lumber: 0, clay: 0, iron: 0, crop: 0 },
            }),
            scheduledFor: returnsAt,
          },
        });
      }
    });

    res.json({
      success: true,
      data: {
        recalled: reinforcingTroops.length,
      },
    });
  } catch (error) {
    console.error('Error recalling reinforcements:', error);
    res.status(500).json({ success: false, error: 'Failed to recall reinforcements' });
  }
});

// Get trapped troops (for Gaul villages)
router.get('/trapped/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    if (village.user.tribe !== 'gauls') {
      return res.status(400).json({ success: false, error: 'Only Gaul villages can trap troops' });
    }

    const trappedTroops = await prisma.troop.findMany({
      where: {
        villageId,
        status: 'trapped',
      },
    });

    res.json({
      success: true,
      data: {
        trapped: trappedTroops.map((t) => ({
          id: t.id,
          unitType: t.unitType,
          quantity: t.quantity,
          trappedAt: t.trappedAt,
          originalOwnerId: t.originalOwnerId,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching trapped troops:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch trapped troops' });
  }
});

// Release or kill trapped troops
router.post('/trapped/:villageId/action', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;
    const { action, troopIds } = req.body; // action: 'release' | 'kill'

    if (!['release', 'kill'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    if (village.user.tribe !== 'gauls') {
      return res.status(400).json({ success: false, error: 'Only Gaul villages can manage trapped troops' });
    }

    const trappedTroops = await prisma.troop.findMany({
      where: {
        id: { in: troopIds },
        villageId,
        status: 'trapped',
      },
    });

    if (trappedTroops.length === 0) {
      return res.status(404).json({ success: false, error: 'No trapped troops found' });
    }

    await prisma.$transaction(async (tx) => {
      if (action === 'kill') {
        // Simply delete the troops
        await tx.troop.deleteMany({
          where: { id: { in: troopIds } },
        });
      } else {
        // Release troops - send them back home
        for (const troop of trappedTroops) {
          if (!troop.originalOwnerId) continue;

          const ownerVillage = await tx.village.findUnique({
            where: { id: troop.originalOwnerId },
          });

          if (!ownerVillage) {
            // Owner village destroyed, just delete
            await tx.troop.delete({ where: { id: troop.id } });
            continue;
          }

          // Calculate return time
          const distance = calculateDistance(
            village.xCoord,
            village.yCoord,
            ownerVillage.xCoord,
            ownerVillage.yCoord
          );

          const unitData = UNIT_DATA[troop.unitType];
          const returnTime = calculateTravelTime(distance, unitData.speed);
          const returnsAt = new Date(Date.now() + returnTime * 1000);

          // Update troop to returning
          await tx.troop.update({
            where: { id: troop.id },
            data: {
              villageId: troop.originalOwnerId,
              status: 'returning',
              destinationVillageId: troop.originalOwnerId,
              arrivesAt: returnsAt,
              originalOwnerId: null,
              trappedAt: null,
            },
          });

          // Schedule return job
          await tx.gameJob.create({
            data: {
              type: 'troops_return',
              villageId: troop.originalOwnerId,
              data: JSON.stringify({
                returningFrom: villageId,
                plunder: { lumber: 0, clay: 0, iron: 0, crop: 0 },
              }),
              scheduledFor: returnsAt,
            },
          });
        }
      }
    });

    res.json({
      success: true,
      data: {
        action,
        affected: trappedTroops.length,
      },
    });
  } catch (error) {
    console.error('Error managing trapped troops:', error);
    res.status(500).json({ success: false, error: 'Failed to manage trapped troops' });
  }
});

export { router as combatRouter };
