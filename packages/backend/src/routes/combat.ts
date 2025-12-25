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
    const { fromVillageId, toX, toY, troops, attackType } = req.body;

    if (!fromVillageId || toX === undefined || toY === undefined || !troops || !attackType) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!['attack', 'raid', 'reinforcement'].includes(attackType)) {
      return res.status(400).json({ success: false, error: 'Invalid attack type' });
    }

    // Validate troops array
    if (!Array.isArray(troops) || troops.length === 0) {
      return res.status(400).json({ success: false, error: 'No troops selected' });
    }

    // Get attacker village
    const attackerVillage = await prisma.village.findFirst({
      where: { id: fromVillageId, userId: req.userId },
      include: { troops: { where: { status: 'home' } } },
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

    const travelTime = calculateTravelTime(distance, slowestSpeed);
    const now = new Date();
    const arrivesAt = new Date(now.getTime() + travelTime * 1000);

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
        // Create attack record for attacks/raids
        await tx.attack.create({
          data: {
            attackerVillageId: fromVillageId,
            defenderVillageId: targetVillage.id,
            attackType: attackType as AttackType,
            troops: JSON.stringify(validTroops),
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

export { router as combatRouter };
