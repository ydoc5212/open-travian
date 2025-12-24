import { Server as SocketServer } from 'socket.io';
import { prisma } from '../index';
import { emitToVillage, emitToUser } from '../socket';
import { calculateStorageCapacity, UNIT_DATA, calculateTravelTime, calculateDistance, WALL_DEFENSE_BONUS } from '@travian/shared';
import type { Tribe } from '@travian/shared';
import { calculateVillageResources } from '../services/resources';

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
  const { attackerVillageId, defenderVillageId, attackType } = data;

  // Get the attack record
  const attack = await prisma.attack.findFirst({
    where: {
      attackerVillageId,
      defenderVillageId,
      resolved: false,
    },
    orderBy: { arrivesAt: 'asc' },
  });

  if (!attack) {
    console.warn(`No unresolved attack found for ${attackerVillageId} -> ${defenderVillageId}`);
    return;
  }

  // Get attacker and defender villages with their troops and details
  const [attackerVillage, defenderVillage] = await Promise.all([
    prisma.village.findUnique({
      where: { id: attackerVillageId },
      include: { user: { select: { id: true, username: true, tribe: true } } },
    }),
    prisma.village.findUnique({
      where: { id: defenderVillageId },
      include: {
        user: { select: { id: true, username: true, tribe: true } },
        troops: { where: { status: 'home' } },
        buildings: { where: { type: 'wall' } },
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

  // Calculate morale (based on population ratio)
  // Morale reduces attacker effectiveness when attacking much larger empires
  const attackerPop = attackerPopulation._sum.population || 1;
  const defenderPop = defenderPopulation._sum.population || 1;
  const morale = calculateMorale(attackerPop, defenderPop);

  // Calculate combat
  const result = calculateCombat(attackingTroops, defendingTroops, attackType, wallBonus, morale);

  // Calculate resources to plunder (for raids)
  let plunder = { lumber: 0, clay: 0, iron: 0, crop: 0 };
  if (result.attackerWins && attackType === 'raid') {
    // Calculate current resources
    await calculateVillageResources(defenderVillageId);
    const updatedDefender = await prisma.village.findUnique({
      where: { id: defenderVillageId },
    });

    if (updatedDefender) {
      // Surviving attackers can carry resources
      const totalCarryCapacity = result.survivingAttackers.reduce((total, troop) => {
        const unitData = UNIT_DATA[troop.unitType];
        return total + (unitData ? unitData.carryCapacity * troop.quantity : 0);
      }, 0);

      // Distribute carry capacity evenly among resources
      const availableResources = {
        lumber: Math.floor(updatedDefender.lumber),
        clay: Math.floor(updatedDefender.clay),
        iron: Math.floor(updatedDefender.iron),
        crop: Math.floor(updatedDefender.crop),
      };

      const totalAvailable =
        availableResources.lumber +
        availableResources.clay +
        availableResources.iron +
        availableResources.crop;

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
  morale: number = 1.0
): {
  attackerWins: boolean;
  attackerLosses: { unitType: string; quantity: number }[];
  defenderLosses: { unitType: string; quantity: number }[];
  survivingAttackers: { unitType: string; quantity: number }[];
  survivingDefenders: { unitType: string; quantity: number }[];
} {
  // Calculate total offense (affected by morale)
  let totalOffense = 0;
  let infantryOffense = 0;
  let cavalryOffense = 0;

  for (const troop of attackers) {
    const unitData = UNIT_DATA[troop.unitType];
    if (!unitData) continue;

    const offense = unitData.attack * troop.quantity * morale;
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
