import { prisma } from '../index';

// Natar troop types (advanced versions of all tribes)
const NATAR_TROOPS = [
  'natar_pikeman',
  'natar_marksman',
  'natar_marauder',
  'natar_war_elephant',
  'natar_ballista',
  'natar_natarian_knight',
  'natar_warelephant',
];

/**
 * Calculate Natar attack strength based on artefact/WW value and time
 */
function calculateNatarStrength(targetType: 'artefact' | 'world_wonder', targetLevel: number, daysSinceCapture: number): number {
  const baseStrength = targetType === 'world_wonder' ? 1000 : 500;
  const levelMultiplier = 1 + (targetLevel * 0.1);
  const timeMultiplier = 1 + (daysSinceCapture * 0.05);

  return Math.floor(baseStrength * levelMultiplier * timeMultiplier);
}

/**
 * Generate Natar attack composition
 */
function generateNatarTroops(totalStrength: number): Array<{ unitType: string; quantity: number }> {
  const troops: Array<{ unitType: string; quantity: number }> = [];

  // Distribute strength across different unit types
  const distributions = [
    { type: 'natar_pikeman', ratio: 0.3 },
    { type: 'natar_marksman', ratio: 0.2 },
    { type: 'natar_marauder', ratio: 0.15 },
    { type: 'natar_war_elephant', ratio: 0.15 },
    { type: 'natar_ballista', ratio: 0.1 },
    { type: 'natar_natarian_knight', ratio: 0.1 },
  ];

  for (const dist of distributions) {
    const quantity = Math.floor((totalStrength * dist.ratio) / 10); // Divide by unit strength
    if (quantity > 0) {
      troops.push({ unitType: dist.type, quantity });
    }
  }

  return troops;
}

/**
 * Spawn Natar attack on artefact holder
 */
export async function spawnNatarAttackOnArtefact(artefactId: string): Promise<void> {
  try {
    const artefact = await prisma.artefact.findUnique({
      where: { id: artefactId },
      include: {
        owner: true,
      },
    });

    if (!artefact || !artefact.owner || !artefact.capturedAt) {
      return;
    }

    // Calculate days since capture
    const daysSinceCapture = Math.floor((Date.now() - artefact.capturedAt.getTime()) / (1000 * 60 * 60 * 24));

    // Don't attack in first 24h (grace period)
    if (daysSinceCapture < 1) {
      return;
    }

    const strength = calculateNatarStrength('artefact', artefact.size, daysSinceCapture);
    const troops = generateNatarTroops(strength);

    // Random Natar village coordinates near the target
    const natarX = artefact.xCoord + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 20 + 30);
    const natarY = artefact.yCoord + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 20 + 30);

    // Calculate arrival time (2-4 hours away)
    const travelTime = Math.floor(Math.random() * 7200 + 7200); // 2-4 hours in seconds
    const arrivesAt = new Date(Date.now() + travelTime * 1000);

    await prisma.natarAttack.create({
      data: {
        targetVillageId: artefact.ownerId!,
        troops: JSON.stringify(troops),
        arrivesAt,
      },
    });

    console.log(`Natar attack spawned on artefact holder: ${artefact.owner.name} (arrives at ${arrivesAt})`);
  } catch (error) {
    console.error('Error spawning Natar attack on artefact:', error);
  }
}

/**
 * Spawn Natar attack on World Wonder holder
 */
export async function spawnNatarAttackOnWorldWonder(worldWonderId: string): Promise<void> {
  try {
    const worldWonder = await prisma.worldWonder.findUnique({
      where: { id: worldWonderId },
      include: {
        ownerAlliance: {
          include: {
            members: {
              include: {
                user: {
                  include: {
                    villages: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!worldWonder || !worldWonder.ownerAlliance || worldWonder.level < 1) {
      return;
    }

    // Calculate days since WW construction started
    const daysSinceStart = Math.floor((Date.now() - worldWonder.createdAt.getTime()) / (1000 * 60 * 60 * 24));

    const strength = calculateNatarStrength('world_wonder', worldWonder.level, daysSinceStart);
    const troops = generateNatarTroops(strength);

    // Target a random alliance member village
    const allVillages = worldWonder.ownerAlliance.members.flatMap((m) => m.user.villages);
    if (allVillages.length === 0) {
      return;
    }

    const targetVillage = allVillages[Math.floor(Math.random() * allVillages.length)];

    // Random Natar village coordinates
    const natarX = targetVillage.xCoord + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 30 + 50);
    const natarY = targetVillage.yCoord + (Math.random() > 0.5 ? 1 : -1) * Math.floor(Math.random() * 30 + 50);

    // Calculate arrival time (3-6 hours away for WW attacks)
    const travelTime = Math.floor(Math.random() * 10800 + 10800); // 3-6 hours in seconds
    const arrivesAt = new Date(Date.now() + travelTime * 1000);

    await prisma.natarAttack.create({
      data: {
        targetVillageId: targetVillage.id,
        troops: JSON.stringify(troops),
        arrivesAt,
      },
    });

    console.log(`Natar attack spawned on WW alliance: ${targetVillage.name} (arrives at ${arrivesAt})`);
  } catch (error) {
    console.error('Error spawning Natar attack on World Wonder:', error);
  }
}

/**
 * Periodically spawn Natar attacks on artefact and WW holders
 */
export async function spawnPeriodicNatarAttacks(): Promise<void> {
  try {
    // Check server state
    const serverState = await prisma.serverState.findFirst();

    if (!serverState || serverState.phase === 'normal' || serverState.phase === 'ended') {
      return; // No Natar attacks in normal phase or after game end
    }

    // Get all active artefacts
    const activeArtefacts = await prisma.artefact.findMany({
      where: {
        ownerId: { not: null },
        activatedAt: { lte: new Date() },
      },
    });

    // Spawn attacks on random artefacts (10% chance per artefact per check)
    for (const artefact of activeArtefacts) {
      if (Math.random() < 0.1) {
        await spawnNatarAttackOnArtefact(artefact.id);
      }
    }

    // Get all world wonders above level 50
    const worldWonders = await prisma.worldWonder.findMany({
      where: {
        level: { gte: 50 },
        ownerAllianceId: { not: null },
      },
    });

    // Spawn attacks on WWs (higher chance for higher levels)
    for (const ww of worldWonders) {
      const attackChance = Math.min(0.5, (ww.level - 50) * 0.01); // 1% per level above 50, max 50%
      if (Math.random() < attackChance) {
        await spawnNatarAttackOnWorldWonder(ww.id);
      }
    }
  } catch (error) {
    console.error('Error spawning periodic Natar attacks:', error);
  }
}

/**
 * Initialize Natar periodic attack scheduler (call this once when server starts)
 */
export function initializeNatarScheduler(): void {
  // Run every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  setInterval(() => {
    spawnPeriodicNatarAttacks();
  }, SIX_HOURS);

  console.log('Natar attack scheduler initialized');
}
