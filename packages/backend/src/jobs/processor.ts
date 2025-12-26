import { Server as SocketServer } from 'socket.io';
import { prisma } from '../index';
import { emitToVillage, emitToUser } from '../socket';
import {
  calculateStorageCapacity,
  UNIT_DATA,
  calculateTravelTime,
  calculateDistance,
  WALL_DEFENSE_BONUS,
  SCOUT_UNITS,
  RAM_UNITS,
  CATAPULT_UNITS,
  CRANNY_CAPACITY,
  TEUTON_CRANNY_BYPASS,
  calculateTrapperCapacity,
  GAME_CONFIG,
} from '@travian/shared';
import type { Tribe } from '@travian/shared';
import { calculateVillageResources } from '../services/resources';
import { startNextQueuedItem } from './queue-helper';

const POLL_INTERVAL = 5000; // Check every 5 seconds

export async function startJobProcessor(io: SocketServer) {
  console.log('Starting job processor...');

  // Process jobs on an interval
  setInterval(async () => {
    await processJobs(io);
  }, POLL_INTERVAL);

  // Also process immediately on start
  await processJobs(io);
}

async function processJobs(io: SocketServer) {
  const now = new Date();

  // Find all unprocessed jobs that should be completed
  const jobs = await prisma.gameJob.findMany({
    where: {
      processed: false,
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: 'asc' },
  });

  for (const job of jobs) {
    try {
      await processJob(io, job);
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
    }
  }
}

async function processJob(io: SocketServer, job: any) {
  const { type, villageId } = job;
  const data = JSON.parse(job.data);

  switch (type) {
    case 'building_complete':
      await handleBuildingComplete(io, villageId, data);
      break;

    case 'field_complete':
      await handleFieldComplete(io, villageId, data);
      break;

    case 'troop_training':
      await handleTroopTraining(io, villageId, data);
      break;

    case 'attack_resolve':
      await handleAttackResolve(io, villageId, data);
      break;

    case 'troops_return':
      await handleTroopsReturn(io, villageId, data);
      break;

    case 'reinforcement_arrive':
      await handleReinforcementArrive(io, villageId, data);
      break;

    case 'trade_arrive':
      await handleTradeArrive(io, villageId, data);
      break;

    case 'celebration_complete':
      await handleCelebrationComplete(io, villageId, data);
      break;

    case 'settlers_arrive':
      await handleSettlersArrive(io, villageId, data);
      break;

    case 'adventure_complete':
      await handleAdventureComplete(io, villageId, data);
      break;

    case 'troop_return_evasion':
      await handleTroopReturnEvasion(io, villageId, data);
      break;

    default:
      console.warn(`Unknown job type: ${type}`);
  }

  // Mark job as processed
  await prisma.gameJob.update({
    where: { id: job.id },
    data: { processed: true },
  });
}

async function handleBuildingComplete(io: SocketServer, villageId: string, data: any) {
  const { slot, targetLevel } = data;

  const building = await prisma.building.findUnique({
    where: { villageId_slot: { villageId, slot } },
  });

  if (!building || !building.upgradeEndsAt) {
    console.warn(`Building ${villageId}:${slot} not found or not upgrading`);
    return;
  }

  // Complete the upgrade
  await prisma.building.update({
    where: { villageId_slot: { villageId, slot } },
    data: {
      level: targetLevel,
      upgradeStartedAt: null,
      upgradeEndsAt: null,
    },
  });

  // Update village stats based on building type
  if (building.type === 'warehouse') {
    const newCapacity = calculateStorageCapacity(targetLevel);
    await prisma.village.update({
      where: { id: villageId },
      data: { warehouseCapacity: newCapacity },
    });
  } else if (building.type === 'granary') {
    const newCapacity = calculateStorageCapacity(targetLevel);
    await prisma.village.update({
      where: { id: villageId },
      data: { granaryCapacity: newCapacity },
    });
  }

  // Update population based on building level
  await updateVillagePopulation(villageId);

  // Get village owner for notifications
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true },
  });

  if (village) {
    // Emit to village room
    emitToVillage(io, villageId, 'building:complete', {
      villageId,
      slot,
      type: building.type,
      level: targetLevel,
    });

    // Also emit to user
    emitToUser(io, village.userId, 'building:complete', {
      villageId,
      slot,
      type: building.type,
      level: targetLevel,
    });
  }

  // Check for queued items and start next one
  await startNextQueuedItem(villageId);

  console.log(`Building complete: ${building.type} level ${targetLevel} at village ${villageId}`);
}

async function handleFieldComplete(io: SocketServer, villageId: string, data: any) {
  const { slot, targetLevel } = data;

  const field = await prisma.resourceField.findUnique({
    where: { villageId_slot: { villageId, slot } },
  });

  if (!field || !field.upgradeEndsAt) {
    console.warn(`Field ${villageId}:${slot} not found or not upgrading`);
    return;
  }

  // Complete the upgrade
  await prisma.resourceField.update({
    where: { villageId_slot: { villageId, slot } },
    data: {
      level: targetLevel,
      upgradeStartedAt: null,
      upgradeEndsAt: null,
    },
  });

  // Update population
  await updateVillagePopulation(villageId);

  // Get village owner for notifications
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true },
  });

  if (village) {
    emitToVillage(io, villageId, 'field:complete', {
      villageId,
      slot,
      type: field.type,
      level: targetLevel,
    });

    emitToUser(io, village.userId, 'field:complete', {
      villageId,
      slot,
      type: field.type,
      level: targetLevel,
    });
  }

  // Check for queued items and start next one
  await startNextQueuedItem(villageId);

  console.log(`Field complete: ${field.type} level ${targetLevel} at village ${villageId}`);
}

async function handleTroopTraining(io: SocketServer, villageId: string, data: any) {
  const { unitType, quantity } = data;

  // Add troops to village
  const existingTroop = await prisma.troop.findFirst({
    where: {
      villageId,
      unitType,
      status: 'home',
    },
  });

  if (existingTroop) {
    await prisma.troop.update({
      where: { id: existingTroop.id },
      data: { quantity: existingTroop.quantity + quantity },
    });
  } else {
    await prisma.troop.create({
      data: {
        villageId,
        unitType,
        quantity,
        status: 'home',
      },
    });
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true },
  });

  if (village) {
    emitToVillage(io, villageId, 'troops:trained', {
      villageId,
      unitType,
      quantity,
    });
  }

  console.log(`Troops trained: ${quantity}x ${unitType} at village ${villageId}`);
}

async function handleAttackResolve(io: SocketServer, villageId: string, data: any) {
  const { attackId } = data;

  // Get the attack record
  const attack = await prisma.attack.findUnique({
    where: { id: attackId },
  });

  if (!attack) {
    console.warn(`Attack ${attackId} not found`);
    return;
  }

  // Check for automatic evasion (Gold Club feature)
  const { processAutomaticEvasion } = await import('../services/evasion');
  const evaded = await processAutomaticEvasion(attackId);

  if (evaded) {
    console.log(`Attack ${attackId} evaded by Gold Club automatic evasion`);
    // Mark attack as resolved but with evasion result
    await prisma.attack.update({
      where: { id: attackId },
      data: { resolved: true },
    });
    return;
  }

  const { attackerVillageId, defenderVillageId } = attack;

  // Get attacker and defender villages with their troops and details
  const [attackerVillage, defenderVillage] = await Promise.all([
    prisma.village.findUnique({
      where: { id: attackerVillageId },
      include: {
        user: { select: { id: true, username: true, tribe: true } },
        buildings: true,
      },
    }),
    prisma.village.findUnique({
      where: { id: defenderVillageId },
      include: {
        user: { select: { id: true, username: true, tribe: true } },
        troops: { where: { status: 'home' } },
        buildings: true, // Get all buildings for cranny, trapper, wall, and catapult targets
      },
    }),
  ]);

  // Get total population for both sides (for morale calculation)
  const [attackerPopulation, defenderPopulation] = await Promise.all([
    prisma.village.aggregate({
      where: { userId: attackerVillage?.user.id },
      _sum: { population: true },
    }),
    prisma.village.aggregate({
      where: { userId: defenderVillage?.user.id },
      _sum: { population: true },
    }),
  ]);

  if (!attackerVillage || !defenderVillage) {
    console.warn('Villages not found for attack resolution');
    return;
  }

  // Parse attacking troops from the attack record
  const attackingTroops: { unitType: string; quantity: number }[] = JSON.parse(attack.troops);
  const attackType = attack.attackType;

  // Handle scout attacks separately
  if (attackType === 'scout') {
    await handleScoutAttack(
      io,
      attack,
      attackerVillage,
      defenderVillage,
      attackingTroops
    );
    return;
  }

  // Get defender's troops at home
  const defendingTroops = defenderVillage.troops.map((t) => ({
    unitType: t.unitType,
    quantity: t.quantity,
  }));

  // Calculate wall defense bonus (tribe-specific)
  const wall = defenderVillage.buildings.find((b) => b.type === 'wall');
  const defenderTribe = defenderVillage.user.tribe as Tribe;
  const wallBonusPerLevel = WALL_DEFENSE_BONUS[defenderTribe] || 1.03;
  const wallBonus = wall ? Math.pow(wallBonusPerLevel, wall.level) : 1;

  // Calculate Brewery attack bonus (Teutons only)
  const attackerTribe = attackerVillage.user.tribe as Tribe;
  let breweryBonus = 1.0;
  if (attackerTribe === 'teutons') {
    const brewery = attackerVillage.buildings.find((b) => b.type === 'brewery');
    if (brewery && brewery.level > 0) {
      // 1% attack bonus per level (max 20%)
      breweryBonus = 1 + (brewery.level / 100);
    }
  }

  // Calculate morale (based on population ratio)
  // Morale reduces attacker effectiveness when attacking much larger empires
  const attackerPop = attackerPopulation._sum.population || 1;
  const defenderPop = defenderPopulation._sum.population || 1;
  const morale = calculateMorale(attackerPop, defenderPop);

  // Calculate combat
  const result = calculateCombat(attackingTroops, defendingTroops, attackType, wallBonus, morale, breweryBonus);

  // Calculate resources to plunder (for raids)
  let plunder = { lumber: 0, clay: 0, iron: 0, crop: 0 };
  if (result.attackerWins && attackType === 'raid') {
    // Calculate current resources
    await calculateVillageResources(defenderVillageId);
    const updatedDefender = await prisma.village.findUnique({
      where: { id: defenderVillageId },
    });

    if (updatedDefender) {
      // Calculate cranny protection
      const crannies = defenderVillage.buildings.filter((b: { type: string | null }) => b.type === 'cranny');
      const crannyCap = CRANNY_CAPACITY[defenderTribe] || 1000;
      let totalCrannyCapacity = crannies.reduce((sum, c) => sum + crannyCap * c.level, 0);

      // Teutons bypass 1/3 of cranny protection
      if (attackerTribe === 'teutons') {
        totalCrannyCapacity *= (1 - TEUTON_CRANNY_BYPASS);
      }

      // Surviving attackers can carry resources
      const totalCarryCapacity = result.survivingAttackers.reduce((total, troop) => {
        const unitData = UNIT_DATA[troop.unitType];
        return total + (unitData ? unitData.carryCapacity * troop.quantity : 0);
      }, 0);

      // Calculate available resources (after cranny hiding)
      const totalResources = {
        lumber: Math.floor(updatedDefender.lumber),
        clay: Math.floor(updatedDefender.clay),
        iron: Math.floor(updatedDefender.iron),
        crop: Math.floor(updatedDefender.crop),
      };

      const totalAmount = totalResources.lumber + totalResources.clay + totalResources.iron + totalResources.crop;

      // Distribute cranny capacity proportionally
      let availableResources = { lumber: 0, clay: 0, iron: 0, crop: 0 };
      if (totalAmount > totalCrannyCapacity) {
        const hiddenAmount = totalCrannyCapacity;
        availableResources = {
          lumber: Math.max(0, totalResources.lumber - Math.floor((totalResources.lumber / totalAmount) * hiddenAmount)),
          clay: Math.max(0, totalResources.clay - Math.floor((totalResources.clay / totalAmount) * hiddenAmount)),
          iron: Math.max(0, totalResources.iron - Math.floor((totalResources.iron / totalAmount) * hiddenAmount)),
          crop: Math.max(0, totalResources.crop - Math.floor((totalResources.crop / totalAmount) * hiddenAmount)),
        };
      } else {
        // All resources are hidden
        availableResources = { lumber: 0, clay: 0, iron: 0, crop: 0 };
      }

      const totalAvailable = availableResources.lumber + availableResources.clay + availableResources.iron + availableResources.crop;

      if (totalAvailable > 0 && totalCarryCapacity > 0) {
        const carryRatio = Math.min(1, totalCarryCapacity / totalAvailable);
        plunder = {
          lumber: Math.floor(availableResources.lumber * carryRatio),
          clay: Math.floor(availableResources.clay * carryRatio),
          iron: Math.floor(availableResources.iron * carryRatio),
          crop: Math.floor(availableResources.crop * carryRatio),
        };
      }
    }
  }

  // Check for trapper (Gauls only) - trap some attacking troops
  let trappedTroops: { unitType: string; quantity: number }[] = [];
  if (defenderTribe === 'gauls' && !result.attackerWins) {
    const trapper = defenderVillage.buildings.find((b) => b.type === 'trapper');
    if (trapper && trapper.level > 0) {
      const trapperCapacity = calculateTrapperCapacity(trapper.level);

      // Count how many troops are already trapped
      const existingTrapped = await prisma.troop.findMany({
        where: {
          villageId: defenderVillageId,
          status: 'trapped',
        },
      });
      const currentlyTrapped = existingTrapped.reduce((sum, t) => sum + t.quantity, 0);
      const availableCapacity = Math.max(0, trapperCapacity - currentlyTrapped);

      if (availableCapacity > 0 && result.survivingAttackers.length > 0) {
        // Trap up to available capacity
        let trapped = 0;
        for (const troop of result.survivingAttackers) {
          const canTrap = Math.min(troop.quantity, availableCapacity - trapped);
          if (canTrap > 0) {
            trappedTroops.push({ unitType: troop.unitType, quantity: canTrap });
            trapped += canTrap;
          }
          if (trapped >= availableCapacity) break;
        }

        // Remove trapped troops from survivors
        for (const trapped of trappedTroops) {
          const survivor = result.survivingAttackers.find(s => s.unitType === trapped.unitType);
          if (survivor) {
            survivor.quantity -= trapped.quantity;
          }
        }
        // Clean up zero quantities
        result.survivingAttackers = result.survivingAttackers.filter(s => s.quantity > 0);
      }
    }
  }

  // Calculate ram wall damage
  let wallDamage = 0;
  const rams = attackingTroops.filter(t => RAM_UNITS.has(t.unitType));
  if (rams.length > 0 && result.attackerWins) {
    const totalRams = rams.reduce((sum, r) => sum + r.quantity, 0);
    const survivingRams = result.survivingAttackers
      .filter(t => RAM_UNITS.has(t.unitType))
      .reduce((sum, r) => sum + r.quantity, 0);

    // Travian formula: each ram destroys ~1-2% of wall level
    const wall = defenderVillage.buildings.find((b) => b.type === 'wall');
    if (wall && wall.level > 0) {
      // Base damage: 1 level per 10 rams, reduced by wall strength
      const baseDamage = survivingRams / 10;
      const wallStrength = Math.pow(1.05, wall.level);
      wallDamage = Math.max(1, Math.floor(baseDamage / wallStrength));
    }
  }

  // Calculate Stonemason protection (capital only)
  let stonemasonProtection = 1.0;
  if (defenderVillage.isCapital) {
    const stonemason = defenderVillage.buildings.find((b) => b.type === 'stonemason');
    if (stonemason && stonemason.level > 0) {
      // 10% damage reduction per level (max 50% at level 5)
      stonemasonProtection = 1 - (stonemason.level * 0.1);
    }
  }

  // Calculate catapult building damage
  let buildingDamage: { slot: number; damage: number } | null = null;
  const catapults = attackingTroops.filter(t => CATAPULT_UNITS.has(t.unitType));
  if (catapults.length > 0 && result.attackerWins) {
    const survivingCatapults = result.survivingAttackers
      .filter(t => CATAPULT_UNITS.has(t.unitType))
      .reduce((sum, c) => sum + c.quantity, 0);

    if (survivingCatapults > 0 && attack.targetBuilding) {
      // Find the target building
      const targetBuilding = defenderVillage.buildings.find(
        b => b.type === attack.targetBuilding && b.level > 0
      );

      if (targetBuilding) {
        // Travian formula: ~1 level per 20 catapults, less effective at higher levels
        const baseDamage = survivingCatapults / 20;
        const buildingStrength = Math.pow(1.1, targetBuilding.level);
        const rawDamage = Math.max(1, Math.floor(baseDamage / buildingStrength));
        // Apply stonemason protection
        const damage = Math.max(1, Math.floor(rawDamage * stonemasonProtection));
        buildingDamage = { slot: targetBuilding.slot, damage };
      }
    } else if (survivingCatapults > 0) {
      // Random building target if none specified
      const targetableBuildings = defenderVillage.buildings.filter(
        b => b.type && b.level > 0 && b.type !== 'wall'
      );
      if (targetableBuildings.length > 0) {
        const randomBuilding = targetableBuildings[Math.floor(Math.random() * targetableBuildings.length)];
        const baseDamage = survivingCatapults / 20;
        const buildingStrength = Math.pow(1.1, randomBuilding.level);
        const rawDamage = Math.max(1, Math.floor(baseDamage / buildingStrength));
        // Apply stonemason protection
        const damage = Math.max(1, Math.floor(rawDamage * stonemasonProtection));
        buildingDamage = { slot: randomBuilding.slot, damage };
      }
    }
  }

  // Apply combat results in a transaction
  await prisma.$transaction(async (tx) => {
    // Mark attack as resolved
    await tx.attack.update({
      where: { id: attack.id },
      data: { resolved: true },
    });

    // Delete attacking troops from "attacking" status
    await tx.troop.deleteMany({
      where: {
        villageId: attackerVillageId,
        status: 'attacking',
        destinationVillageId: defenderVillageId,
      },
    });

    // Create trapped troops if any
    if (trappedTroops.length > 0) {
      for (const trapped of trappedTroops) {
        await tx.troop.create({
          data: {
            villageId: defenderVillageId,
            unitType: trapped.unitType,
            quantity: trapped.quantity,
            status: 'trapped',
            originalOwnerId: attackerVillageId,
            trappedAt: new Date(),
          },
        });
      }
    }

    // Apply wall damage
    if (wallDamage > 0) {
      const wall = defenderVillage.buildings.find((b) => b.type === 'wall');
      if (wall) {
        const newLevel = Math.max(0, wall.level - wallDamage);
        await tx.building.update({
          where: { id: wall.id },
          data: { level: newLevel },
        });
      }
    }

    // Apply building damage
    if (buildingDamage) {
      const building = await tx.building.findUnique({
        where: { villageId_slot: { villageId: defenderVillageId, slot: buildingDamage.slot } },
      });
      if (building) {
        const newLevel = Math.max(0, building.level - buildingDamage.damage);
        await tx.building.update({
          where: { id: building.id },
          data: { level: newLevel },
        });
      }
    }

    // Update defender troops (losses)
    for (const defenderTroop of defendingTroops) {
      const surviving = result.survivingDefenders.find(
        (t) => t.unitType === defenderTroop.unitType
      );
      const survivingQty = surviving?.quantity || 0;

      if (survivingQty <= 0) {
        await tx.troop.deleteMany({
          where: {
            villageId: defenderVillageId,
            unitType: defenderTroop.unitType,
            status: 'home',
          },
        });
      } else if (survivingQty < defenderTroop.quantity) {
        await tx.troop.updateMany({
          where: {
            villageId: defenderVillageId,
            unitType: defenderTroop.unitType,
            status: 'home',
          },
          data: { quantity: survivingQty },
        });
      }
    }

    // Handle surviving attackers (they return home)
    if (result.survivingAttackers.length > 0) {
      const distance = calculateDistance(
        attackerVillage.xCoord,
        attackerVillage.yCoord,
        defenderVillage.xCoord,
        defenderVillage.yCoord
      );

      // Find slowest surviving unit
      let slowestSpeed = Infinity;
      for (const troop of result.survivingAttackers) {
        const unitData = UNIT_DATA[troop.unitType];
        if (unitData && unitData.speed < slowestSpeed) {
          slowestSpeed = unitData.speed;
        }
      }

      const returnTime = calculateTravelTime(distance, slowestSpeed);
      const returnsAt = new Date(Date.now() + returnTime * 1000);

      // Create returning troops
      for (const troop of result.survivingAttackers) {
        await tx.troop.create({
          data: {
            villageId: attackerVillageId,
            unitType: troop.unitType,
            quantity: troop.quantity,
            status: 'returning',
            destinationVillageId: attackerVillageId,
            arrivesAt: returnsAt,
          },
        });
      }

      // Schedule return job
      await tx.gameJob.create({
        data: {
          type: 'troops_return',
          villageId: attackerVillageId,
          data: JSON.stringify({
            returningFrom: defenderVillageId,
            plunder,
          }),
          scheduledFor: returnsAt,
        },
      });
    }

    // Deduct plundered resources from defender
    if (plunder.lumber + plunder.clay + plunder.iron + plunder.crop > 0) {
      await tx.village.update({
        where: { id: defenderVillageId },
        data: {
          lumber: { decrement: plunder.lumber },
          clay: { decrement: plunder.clay },
          iron: { decrement: plunder.iron },
          crop: { decrement: plunder.crop },
        },
      });
    }

    // Create battle reports for both parties
    const reportData = {
      attackerVillage: {
        id: attackerVillageId,
        name: attackerVillage.name,
        owner: attackerVillage.user.username,
        coordinates: { x: attackerVillage.xCoord, y: attackerVillage.yCoord },
      },
      defenderVillage: {
        id: defenderVillageId,
        name: defenderVillage.name,
        owner: defenderVillage.user.username,
        coordinates: { x: defenderVillage.xCoord, y: defenderVillage.yCoord },
      },
      attackType,
      attackingTroops,
      defendingTroops,
      attackerLosses: result.attackerLosses,
      defenderLosses: result.defenderLosses,
      survivingAttackers: result.survivingAttackers,
      survivingDefenders: result.survivingDefenders,
      attackerWins: result.attackerWins,
      plunder,
    };

    // Report for attacker
    await tx.report.create({
      data: {
        userId: attackerVillage.user.id,
        type: 'battle',
        data: JSON.stringify(reportData),
      },
    });

    // Report for defender
    await tx.report.create({
      data: {
        userId: defenderVillage.user.id,
        type: 'battle',
        data: JSON.stringify(reportData),
      },
    });
  });

  // Emit notifications
  emitToUser(io, attackerVillage.user.id, 'battle:complete', {
    attackerWins: result.attackerWins,
    targetVillage: defenderVillage.name,
  });

  emitToUser(io, defenderVillage.user.id, 'battle:complete', {
    attackerWins: result.attackerWins,
    attackerVillage: attackerVillage.name,
  });

  console.log(
    `Battle resolved: ${attackerVillage.name} vs ${defenderVillage.name} - ` +
      `${result.attackerWins ? 'Attacker' : 'Defender'} wins`
  );
}

async function handleTroopsReturn(io: SocketServer, villageId: string, data: any) {
  const { returningFrom, plunder } = data;

  // Find returning troops
  const returningTroops = await prisma.troop.findMany({
    where: {
      villageId,
      status: 'returning',
      destinationVillageId: villageId,
    },
  });

  await prisma.$transaction(async (tx) => {
    // Merge returning troops with home troops
    for (const troop of returningTroops) {
      const existingHome = await tx.troop.findFirst({
        where: {
          villageId,
          unitType: troop.unitType,
          status: 'home',
        },
      });

      if (existingHome) {
        await tx.troop.update({
          where: { id: existingHome.id },
          data: { quantity: existingHome.quantity + troop.quantity },
        });
        await tx.troop.delete({ where: { id: troop.id } });
      } else {
        await tx.troop.update({
          where: { id: troop.id },
          data: {
            status: 'home',
            destinationVillageId: null,
            arrivesAt: null,
          },
        });
      }
    }

    // Add plundered resources to village
    if (plunder && (plunder.lumber + plunder.clay + plunder.iron + plunder.crop > 0)) {
      await tx.village.update({
        where: { id: villageId },
        data: {
          lumber: { increment: plunder.lumber },
          clay: { increment: plunder.clay },
          iron: { increment: plunder.iron },
          crop: { increment: plunder.crop },
        },
      });
    }
  });

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true, name: true },
  });

  if (village) {
    emitToVillage(io, villageId, 'troops:returned', {
      villageId,
      plunder,
    });

    emitToUser(io, village.userId, 'troops:returned', {
      villageName: village.name,
      plunder,
    });
  }

  console.log(`Troops returned to ${villageId} with plunder:`, plunder);
}

// Calculate morale based on population ratio (Travian formula)
// Morale affects attacker offense when attacking much larger empires
function calculateMorale(attackerPop: number, defenderPop: number): number {
  // If attacker has more population, morale is 100%
  if (attackerPop >= defenderPop) {
    return 1.0;
  }

  // Travian morale formula: morale = (attacker_pop / defender_pop)^0.2
  // Minimum morale is 33%
  const morale = Math.pow(attackerPop / defenderPop, 0.2);
  return Math.max(0.33, morale);
}

// Cavalry unit types for proper defense calculation
const CAVALRY_UNITS = new Set([
  // Romans
  'equites_legati', 'equites_imperatoris', 'equites_caesaris',
  // Gauls
  'pathfinder', 'theutates_thunder', 'druidrider', 'haeduan',
  // Teutons
  'scout', 'paladin', 'teutonic_knight',
]);

// Travian-style combat calculation
function calculateCombat(
  attackers: { unitType: string; quantity: number }[],
  defenders: { unitType: string; quantity: number }[],
  attackType: string,
  wallBonus: number,
  morale: number = 1.0,
  breweryBonus: number = 1.0
): {
  attackerWins: boolean;
  attackerLosses: { unitType: string; quantity: number }[];
  defenderLosses: { unitType: string; quantity: number }[];
  survivingAttackers: { unitType: string; quantity: number }[];
  survivingDefenders: { unitType: string; quantity: number }[];
} {
  // Calculate total offense (affected by morale and brewery bonus)
  let totalOffense = 0;
  let infantryOffense = 0;
  let cavalryOffense = 0;

  for (const troop of attackers) {
    const unitData = UNIT_DATA[troop.unitType];
    if (!unitData) continue;

    const offense = unitData.attack * troop.quantity * morale * breweryBonus;
    totalOffense += offense;

    // Determine if unit is cavalry (based on unit type, not speed)
    if (CAVALRY_UNITS.has(troop.unitType)) {
      cavalryOffense += offense;
    } else {
      infantryOffense += offense;
    }
  }

  // Calculate total defense (weighted by attack composition)
  let totalDefense = 0;
  const infantryRatio = totalOffense > 0 ? infantryOffense / totalOffense : 0.5;
  const cavalryRatio = totalOffense > 0 ? cavalryOffense / totalOffense : 0.5;

  for (const troop of defenders) {
    const unitData = UNIT_DATA[troop.unitType];
    if (!unitData) continue;

    // Weighted defense based on incoming attack type ratio
    const baseDefense =
      unitData.defenseInfantry * infantryRatio + unitData.defenseCavalry * cavalryRatio;

    // Apply wall bonus
    const defense = baseDefense * troop.quantity * wallBonus;
    totalDefense += defense;
  }

  // Handle case where defender has no troops
  if (totalDefense === 0 && defenders.length === 0) {
    return {
      attackerWins: true,
      attackerLosses: [],
      defenderLosses: [],
      survivingAttackers: attackers.map((a) => ({ ...a })),
      survivingDefenders: [],
    };
  }

  // Combat resolution
  const attackerWins = totalOffense > totalDefense;

  // Calculate loss ratios using Travian formula
  // Formula: losses = (weaker/stronger)^1.5 for the winner
  let attackerLossRatio: number;
  let defenderLossRatio: number;

  if (attackerWins) {
    // Attacker wins - defender loses all, attacker loses proportionally
    const ratio = totalDefense / totalOffense;
    attackerLossRatio = Math.pow(ratio, 1.5);
    defenderLossRatio = 1; // Defender loses all troops
  } else {
    // Defender wins - attacker loses all, defender loses proportionally
    const ratio = totalOffense / totalDefense;
    attackerLossRatio = 1;
    defenderLossRatio = Math.pow(ratio, 1.5);
  }

  // Raids are less deadly for attackers (attackers can retreat with ~20% less casualties)
  if (attackType === 'raid') {
    attackerLossRatio *= 0.8;
  }

  // Apply "immense superiority" rule - if one side is 20x stronger, loser is annihilated
  // and winner takes minimal losses
  const powerRatio = Math.max(totalOffense, 0.1) / Math.max(totalDefense, 0.1);
  if (powerRatio >= 20) {
    attackerLossRatio = 0.01; // Near-total victory
    defenderLossRatio = 1;
  } else if (powerRatio <= 0.05) {
    attackerLossRatio = 1;
    defenderLossRatio = 0.01; // Near-total victory
  }

  // Calculate actual losses
  const attackerLosses: { unitType: string; quantity: number }[] = [];
  const survivingAttackers: { unitType: string; quantity: number }[] = [];

  for (const troop of attackers) {
    const losses = Math.min(troop.quantity, Math.floor(troop.quantity * attackerLossRatio));
    const surviving = troop.quantity - losses;

    if (losses > 0) {
      attackerLosses.push({ unitType: troop.unitType, quantity: losses });
    }
    if (surviving > 0) {
      survivingAttackers.push({ unitType: troop.unitType, quantity: surviving });
    }
  }

  const defenderLosses: { unitType: string; quantity: number }[] = [];
  const survivingDefenders: { unitType: string; quantity: number }[] = [];

  for (const troop of defenders) {
    const losses = Math.min(troop.quantity, Math.floor(troop.quantity * defenderLossRatio));
    const surviving = troop.quantity - losses;

    if (losses > 0) {
      defenderLosses.push({ unitType: troop.unitType, quantity: losses });
    }
    if (surviving > 0) {
      survivingDefenders.push({ unitType: troop.unitType, quantity: surviving });
    }
  }

  return {
    attackerWins,
    attackerLosses,
    defenderLosses,
    survivingAttackers,
    survivingDefenders,
  };
}

// Calculate and update village population based on buildings and fields
async function updateVillagePopulation(villageId: string) {
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    include: {
      buildings: true,
      resourceFields: true,
    },
  });

  if (!village) return;

  // Population = sum of all building levels + sum of all field levels
  const buildingPop = village.buildings.reduce((sum, b) => sum + b.level, 0);
  const fieldPop = village.resourceFields.reduce((sum, f) => sum + f.level, 0);
  const totalPop = buildingPop + fieldPop;

  await prisma.village.update({
    where: { id: villageId },
    data: { population: totalPop },
  });
}

async function handleReinforcementArrive(io: SocketServer, villageId: string, data: any) {
  const { fromVillageId, toVillageId, troops } = data;

  // Find reinforcing troops
  const reinforcingTroops = await prisma.troop.findMany({
    where: {
      villageId: fromVillageId,
      status: 'reinforcing',
      destinationVillageId: toVillageId,
    },
  });

  await prisma.$transaction(async (tx) => {
    // Update troops to be stationed at the reinforced village
    for (const troop of reinforcingTroops) {
      // Change to destination village and set to home status, but remember original owner
      await tx.troop.update({
        where: { id: troop.id },
        data: {
          villageId: toVillageId,
          status: 'home',
          destinationVillageId: null,
          arrivesAt: null,
          originalOwnerId: fromVillageId, // Track where they came from for recall
        },
      });
    }

    // Create notification report
    const fromVillage = await tx.village.findUnique({
      where: { id: fromVillageId },
      select: { name: true, xCoord: true, yCoord: true, userId: true },
    });

    const toVillage = await tx.village.findUnique({
      where: { id: toVillageId },
      select: { name: true, xCoord: true, yCoord: true, user: { select: { id: true } } },
    });

    if (fromVillage && toVillage) {
      const reportData = {
        type: 'reinforcement',
        fromVillage: {
          id: fromVillageId,
          name: fromVillage.name,
          coordinates: { x: fromVillage.xCoord, y: fromVillage.yCoord },
        },
        toVillage: {
          id: toVillageId,
          name: toVillage.name,
          coordinates: { x: toVillage.xCoord, y: toVillage.yCoord },
        },
        troops,
      };

      // Report for both sender and receiver (in case they're different users)
      await tx.report.create({
        data: {
          userId: toVillage.user.id,
          type: 'reinforcement',
          data: JSON.stringify(reportData),
        },
      });

      // Emit notification
      emitToUser(io, toVillage.user.id, 'reinforcement:arrived', {
        villageName: toVillage.name,
        fromVillageName: fromVillage.name,
      });
    }
  });

  console.log(`Reinforcements arrived at ${toVillageId} from ${fromVillageId}`);
}

async function handleTradeArrive(io: SocketServer, villageId: string, data: any) {
  const { resources } = data;

  if (!resources) {
    console.warn('No resources in trade arrival data');
    return;
  }

  // Add resources to the village
  await prisma.village.update({
    where: { id: villageId },
    data: {
      lumber: { increment: resources.lumber || 0 },
      clay: { increment: resources.clay || 0 },
      iron: { increment: resources.iron || 0 },
      crop: { increment: resources.crop || 0 },
    },
  });

  // Get village and user info for notifications
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true, name: true },
  });

  if (village) {
    emitToVillage(io, villageId, 'trade:arrived', {
      villageId,
      resources,
    });

    emitToUser(io, village.userId, 'trade:arrived', {
      villageName: village.name,
      resources,
    });
  }

  const totalResources = (resources.lumber || 0) + (resources.clay || 0) + (resources.iron || 0) + (resources.crop || 0);
  console.log(`Trade arrived at ${villageId} with ${totalResources} total resources`);
}

// Handle scout attacks with counter-intelligence
async function handleScoutAttack(
  io: SocketServer,
  attack: any,
  attackerVillage: any,
  defenderVillage: any,
  attackingScouts: { unitType: string; quantity: number }[]
) {
  // Get defending scouts
  const defenderScouts = defenderVillage.troops.filter((t: any) => SCOUT_UNITS.has(t.unitType));
  const defendingScoutCount = defenderScouts.reduce((sum: number, t: any) => sum + t.quantity, 0);
  const attackingScoutCount = attackingScouts.reduce((sum, s) => sum + s.quantity, 0);

  // Scout battle - defending scouts fight attacking scouts
  let survivingAttackers = attackingScoutCount;
  let survivingDefenders = defendingScoutCount;
  let scoutLosses = { attacker: 0, defender: 0 };

  if (defendingScoutCount > 0) {
    // Calculate scout vs scout combat
    // Each defending scout kills ~0.1-0.5 attacking scouts (random factor)
    const defenderKills = Math.floor(defendingScoutCount * (0.1 + Math.random() * 0.4));
    const attackerKills = Math.floor(attackingScoutCount * (0.05 + Math.random() * 0.2));

    scoutLosses.attacker = Math.min(attackingScoutCount, defenderKills);
    scoutLosses.defender = Math.min(defendingScoutCount, attackerKills);

    survivingAttackers = attackingScoutCount - scoutLosses.attacker;
    survivingDefenders = defendingScoutCount - scoutLosses.defender;
  }

  // Calculate intel based on surviving scouts
  const scoutRatio = defendingScoutCount > 0
    ? Math.max(0, (survivingAttackers - survivingDefenders) / attackingScoutCount)
    : 1.0;

  // Determine what information is revealed
  let intelLevel = 0;
  if (scoutRatio >= 0.8) {
    intelLevel = 3; // Full intel
  } else if (scoutRatio >= 0.5) {
    intelLevel = 2; // Partial intel
  } else if (scoutRatio >= 0.2) {
    intelLevel = 1; // Minimal intel
  }

  // Calculate current resources
  await calculateVillageResources(defenderVillage.id);
  const updatedDefender = await prisma.village.findUnique({
    where: { id: defenderVillage.id },
  });

  // Build scout report data
  const reportData: any = {
    attackerVillage: {
      id: attackerVillage.id,
      name: attackerVillage.name,
      coordinates: { x: attackerVillage.xCoord, y: attackerVillage.yCoord },
    },
    defenderVillage: {
      id: defenderVillage.id,
      name: defenderVillage.name,
      owner: defenderVillage.user.username,
      coordinates: { x: defenderVillage.xCoord, y: defenderVillage.yCoord },
    },
    scoutsSent: attackingScoutCount,
    scoutsLost: scoutLosses.attacker,
    defendingScouts: defendingScoutCount,
    defendingScoutsLost: scoutLosses.defender,
    intelLevel,
  };

  // Add intel based on level
  if (intelLevel >= 1 && updatedDefender) {
    // Level 1: Resources
    reportData.resources = {
      lumber: Math.floor(updatedDefender.lumber),
      clay: Math.floor(updatedDefender.clay),
      iron: Math.floor(updatedDefender.iron),
      crop: Math.floor(updatedDefender.crop),
    };
  }

  if (intelLevel >= 2) {
    // Level 2: Troops
    reportData.troops = defenderVillage.troops
      .filter((t: any) => t.status === 'home')
      .map((t: any) => ({
        unitType: t.unitType,
        quantity: t.quantity,
      }));
  }

  if (intelLevel >= 3) {
    // Level 3: Buildings
    reportData.buildings = defenderVillage.buildings
      .filter((b: any) => b.type && b.level > 0)
      .map((b: any) => ({
        type: b.type,
        level: b.level,
      }));
  }

  // Apply results in transaction
  await prisma.$transaction(async (tx) => {
    // Mark attack as resolved
    await tx.attack.update({
      where: { id: attack.id },
      data: { resolved: true },
    });

    // Delete attacking scouts
    await tx.troop.deleteMany({
      where: {
        villageId: attackerVillage.id,
        status: 'attacking',
        destinationVillageId: defenderVillage.id,
      },
    });

    // Update defending scouts
    if (scoutLosses.defender > 0) {
      for (const defenderScout of defenderScouts) {
        const lost = Math.min(defenderScout.quantity, scoutLosses.defender);
        scoutLosses.defender -= lost;

        if (lost >= defenderScout.quantity) {
          await tx.troop.delete({ where: { id: defenderScout.id } });
        } else {
          await tx.troop.update({
            where: { id: defenderScout.id },
            data: { quantity: defenderScout.quantity - lost },
          });
        }

        if (scoutLosses.defender <= 0) break;
      }
    }

    // Surviving scouts return home
    if (survivingAttackers > 0) {
      const distance = calculateDistance(
        attackerVillage.xCoord,
        attackerVillage.yCoord,
        defenderVillage.xCoord,
        defenderVillage.yCoord
      );

      const scoutUnit = attackingScouts[0];
      const unitData = UNIT_DATA[scoutUnit.unitType];
      const returnTime = calculateTravelTime(distance, unitData.speed);
      const returnsAt = new Date(Date.now() + returnTime * 1000);

      await tx.troop.create({
        data: {
          villageId: attackerVillage.id,
          unitType: scoutUnit.unitType,
          quantity: survivingAttackers,
          status: 'returning',
          destinationVillageId: attackerVillage.id,
          arrivesAt: returnsAt,
        },
      });

      await tx.gameJob.create({
        data: {
          type: 'troops_return',
          villageId: attackerVillage.id,
          data: JSON.stringify({
            returningFrom: defenderVillage.id,
            plunder: { lumber: 0, clay: 0, iron: 0, crop: 0 },
          }),
          scheduledFor: returnsAt,
        },
      });
    }

    // Create scout report for attacker
    await tx.report.create({
      data: {
        userId: attackerVillage.user.id,
        type: 'scout',
        data: JSON.stringify(reportData),
      },
    });

    // Create scout report for defender
    await tx.report.create({
      data: {
        userId: defenderVillage.user.id,
        type: 'scout',
        data: JSON.stringify({
          ...reportData,
          isDefender: true,
        }),
      },
    });
  });

  // Emit notifications
  emitToUser(io, attackerVillage.user.id, 'scout:complete', {
    targetVillage: defenderVillage.name,
    intelLevel,
  });

  emitToUser(io, defenderVillage.user.id, 'scout:detected', {
    attackerVillage: attackerVillage.name,
    scoutsKilled: scoutLosses.attacker,
  });

  console.log(
    `Scout attack resolved: ${attackerVillage.name} -> ${defenderVillage.name} - ` +
      `Intel level: ${intelLevel}, Attacker losses: ${scoutLosses.attacker}, Defender losses: ${scoutLosses.defender}`
  );
}

async function handleCelebrationComplete(io: SocketServer, villageId: string, data: any) {
  const { celebrationId, culturePoints } = data;

  // Get village and user
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true, name: true },
  });

  if (!village) {
    console.warn(`Village ${villageId} not found for celebration completion`);
    return;
  }

  // Remove the celebration record (it's complete)
  await prisma.celebration.deleteMany({
    where: { id: celebrationId },
  });

  // Create a report for the user
  await prisma.report.create({
    data: {
      userId: village.userId,
      type: 'celebration',
      data: JSON.stringify({
        villageName: village.name,
        culturePoints,
        completedAt: new Date(),
      }),
    },
  });

  // Emit notification
  emitToVillage(io, villageId, 'celebration:complete', {
    villageId,
    culturePoints,
  });

  emitToUser(io, village.userId, 'celebration:complete', {
    villageName: village.name,
    culturePoints,
  });

  console.log(`Celebration complete at ${village.name}: ${culturePoints} culture points`);
}

async function handleAdventureComplete(io: SocketServer, villageId: string, data: any) {
  const { adventureId, heroId, difficulty } = data;

  // Get hero
  const hero = await prisma.hero.findUnique({
    where: { id: heroId },
    include: {
      user: {
        select: { id: true },
      },
      village: {
        select: { id: true, name: true },
      },
    },
  });

  if (!hero) {
    console.warn(`Hero ${heroId} not found for adventure completion`);
    return;
  }

  // Calculate rewards based on difficulty
  const ADVENTURE_REWARDS = {
    easy: {
      experience: [10, 20, 30],
      resources: { min: 50, max: 150 },
      silver: { min: 10, max: 30 },
    },
    medium: {
      experience: [30, 50, 70],
      resources: { min: 100, max: 300 },
      silver: { min: 30, max: 80 },
    },
    hard: {
      experience: [70, 100, 150],
      resources: { min: 200, max: 500 },
      silver: { min: 80, max: 200 },
    },
  };

  const difficultyRewards = ADVENTURE_REWARDS[difficulty as keyof typeof ADVENTURE_REWARDS] || ADVENTURE_REWARDS.easy;

  // Generate random rewards
  const experience = difficultyRewards.experience[Math.floor(Math.random() * difficultyRewards.experience.length)];
  const resourceAmount = Math.floor(Math.random() * (difficultyRewards.resources.max - difficultyRewards.resources.min + 1)) + difficultyRewards.resources.min;

  // Random resource type
  const resourceTypes = ['lumber', 'clay', 'iron', 'crop'];
  const resourceType = resourceTypes[Math.floor(Math.random() * resourceTypes.length)];

  const rewards = {
    experience,
    resources: {
      lumber: resourceType === 'lumber' ? resourceAmount : 0,
      clay: resourceType === 'clay' ? resourceAmount : 0,
      iron: resourceType === 'iron' ? resourceAmount : 0,
      crop: resourceType === 'crop' ? resourceAmount : 0,
    },
  };

  // Apply rewards in transaction
  await prisma.$transaction(async (tx) => {
    // Update hero
    const newExperience = hero.experience + rewards.experience;
    const newLevel = Math.floor(Math.sqrt(newExperience / 100)) + 1; // Level formula

    await tx.hero.update({
      where: { id: heroId },
      data: {
        experience: newExperience,
        level: Math.max(hero.level, newLevel),
        status: 'home', // Return home
      },
    });

    // Add resources to village
    if (hero.villageId) {
      await tx.village.update({
        where: { id: hero.villageId },
        data: {
          lumber: { increment: rewards.resources.lumber },
          clay: { increment: rewards.resources.clay },
          iron: { increment: rewards.resources.iron },
          crop: { increment: rewards.resources.crop },
        },
      });
    }

    // Mark adventure as completed
    await tx.adventure.update({
      where: { id: adventureId },
      data: {
        completedAt: new Date(),
      },
    });

    // Create report
    await tx.report.create({
      data: {
        userId: hero.user.id,
        type: 'adventure',
        data: JSON.stringify({
          heroName: hero.name,
          difficulty,
          rewards,
          completedAt: new Date(),
        }),
      },
    });
  });

  // Emit notifications
  emitToUser(io, hero.user.id, 'adventure:complete', {
    heroName: hero.name,
    difficulty,
    rewards,
  });

  console.log(`Adventure complete for hero ${hero.name}: ${rewards.experience} XP, ${resourceAmount} ${resourceType}`);
}

async function handleSettlersArrive(io: SocketServer, villageId: string, data: any) {
  const { fromVillageId, x, y, villageName, settlerType } = data;

  // Check if location is still unoccupied
  const existing = await prisma.village.findUnique({
    where: { xCoord_yCoord: { xCoord: x, yCoord: y } },
  });

  if (existing) {
    console.warn(`Cannot found village at (${x}, ${y}) - location already occupied`);
    // Return settlers to source village
    const existingTroop = await prisma.troop.findFirst({
      where: {
        villageId: fromVillageId,
        unitType: settlerType,
        status: 'home',
      },
    });

    if (existingTroop) {
      await prisma.troop.update({
        where: { id: existingTroop.id },
        data: { quantity: existingTroop.quantity + GAME_CONFIG.SETTLERS_REQUIRED },
      });
    } else {
      await prisma.troop.create({
        data: {
          villageId: fromVillageId,
          unitType: settlerType,
          quantity: GAME_CONFIG.SETTLERS_REQUIRED,
          status: 'home',
        },
      });
    }

    return;
  }

  // Get source village info
  const sourceVillage = await prisma.village.findUnique({
    where: { id: fromVillageId },
    select: { userId: true },
  });

  if (!sourceVillage) {
    console.error(`Source village ${fromVillageId} not found`);
    return;
  }

  // Delete the traveling settlers
  await prisma.troop.deleteMany({
    where: {
      villageId: fromVillageId,
      unitType: settlerType,
      status: 'attacking',
    },
  });

  // Create the new village
  await prisma.$transaction(async (tx) => {
    // Create village
    const newVillage = await tx.village.create({
      data: {
        userId: sourceVillage.userId,
        name: villageName,
        xCoord: x,
        yCoord: y,
        isCapital: false,
        loyalty: GAME_CONFIG.STARTING_LOYALTY,
        population: 0,
        lumber: GAME_CONFIG.STARTING_RESOURCES.lumber,
        clay: GAME_CONFIG.STARTING_RESOURCES.clay,
        iron: GAME_CONFIG.STARTING_RESOURCES.iron,
        crop: GAME_CONFIG.STARTING_RESOURCES.crop,
        warehouseCapacity: GAME_CONFIG.BASE_WAREHOUSE_CAPACITY,
        granaryCapacity: GAME_CONFIG.BASE_GRANARY_CAPACITY,
      },
    });

    // Initialize resource fields (classic 4-4-4-6 distribution)
    const resourceFields = GAME_CONFIG.RESOURCE_FIELD_LAYOUT;
    for (let i = 0; i < resourceFields.length; i++) {
      await tx.resourceField.create({
        data: {
          villageId: newVillage.id,
          slot: i + 1,
          type: resourceFields[i],
          level: 0,
        },
      });
    }

    // Initialize building slots (22 slots for village center)
    for (let i = 1; i <= 22; i++) {
      await tx.building.create({
        data: {
          villageId: newVillage.id,
          slot: i,
          type: null,
          level: 0,
        },
      });
    }

    // Create a report for the founding
    await tx.report.create({
      data: {
        userId: sourceVillage.userId,
        type: 'reinforcement', // Reusing this type for now
        data: JSON.stringify({
          type: 'village_founded',
          villageName,
          coordinates: { x, y },
          timestamp: new Date(),
        }),
      },
    });
  });

  // Emit notification
  emitToUser(io, sourceVillage.userId, 'village:founded', {
    villageName,
    coordinates: { x, y },
  });

  console.log(`New village "${villageName}" founded at (${x}, ${y})`);
}

// Helper function to handle conquest in attack resolution
async function handleConquestLogic(
  tx: any,
  attack: any,
  attackerVillage: any,
  defenderVillage: any,
  result: any
): Promise<{ loyaltyReduction: number; villageConquered: boolean }> {
  let loyaltyReduction = 0;
  let villageConquered = false;

  if (attack.isConquest && result.attackerWins) {
    const conquestUnits = ['senator', 'chief', 'chieftain'];
    const conquestTroops = result.survivingAttackers.filter((t: any) =>
      conquestUnits.includes(t.unitType)
    );

    if (conquestTroops.length > 0) {
      // Each chief/senator reduces loyalty by 20-30%
      for (const troop of conquestTroops) {
        for (let i = 0; i < troop.quantity; i++) {
          const reduction =
            GAME_CONFIG.CONQUEST_LOYALTY_REDUCTION_MIN +
            Math.random() *
              (GAME_CONFIG.CONQUEST_LOYALTY_REDUCTION_MAX -
                GAME_CONFIG.CONQUEST_LOYALTY_REDUCTION_MIN);
          loyaltyReduction += Math.floor(reduction);
        }
      }

      // Update village loyalty
      const newLoyalty = Math.max(0, defenderVillage.loyalty - loyaltyReduction);
      await tx.village.update({
        where: { id: defenderVillage.id },
        data: { loyalty: newLoyalty },
      });

      // Check if village was conquered (loyalty reached 0)
      if (newLoyalty <= 0) {
        villageConquered = true;

        // Transfer village ownership
        await tx.village.update({
          where: { id: defenderVillage.id },
          data: {
            userId: attackerVillage.user.id,
            loyalty: GAME_CONFIG.STARTING_LOYALTY, // Reset loyalty to 100
            isCapital: false, // Conquered villages can't be capitals
          },
        });

        console.log(
          `Village ${defenderVillage.name} conquered by ${attackerVillage.user.username}!`
        );
      }
    }
  }

  return { loyaltyReduction, villageConquered };
}

// Handle evaded troops returning home
async function handleTroopReturnEvasion(io: SocketServer, villageId: string, data: any) {
  const { returnEvadedTroops } = await import('../services/evasion');
  await returnEvadedTroops(data, villageId);

  // Get village owner for socket notification
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { userId: true },
  });

  if (village) {
    emitToUser(io, village.userId, 'troops_returned', {
      villageId,
      message: 'Your evaded troops have returned home',
    });
  }

  console.log(`Evaded troops returned to village ${villageId}`);
}
