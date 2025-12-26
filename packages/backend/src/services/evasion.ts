import { prisma } from '../index';

/**
 * Check if user has Gold Club access and automatic evasion enabled
 */
export async function hasAutomaticEvasion(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { goldClubUntil: true },
  });

  if (!user || !user.goldClubUntil) return false;

  const now = new Date();
  return user.goldClubUntil > now;
}

/**
 * Automatically evade incoming attacks for Gold Club members
 * This is called before attack resolution
 */
export async function processAutomaticEvasion(attackId: string): Promise<boolean> {
  const attack = await prisma.attack.findUnique({
    where: { id: attackId },
    include: {
      defenderVillage: {
        include: {
          user: true,
          troops: { where: { status: 'home' } },
        },
      },
    },
  });

  if (!attack) return false;

  // Only process for raid/attack types (not reinforcement or scout)
  if (!['raid', 'attack'].includes(attack.attackType)) {
    return false;
  }

  // Check if defender has Gold Club
  const hasGoldClub = await hasAutomaticEvasion(attack.defenderVillage.userId);
  if (!hasGoldClub) {
    return false;
  }

  // Check if there's a safe village to evade to (defender's other villages)
  const defenderVillages = await prisma.village.findMany({
    where: {
      userId: attack.defenderVillage.userId,
      id: { not: attack.defenderVillage.id },
    },
  });

  if (defenderVillages.length === 0) {
    // No village to evade to
    return false;
  }

  // Pick the closest village as evasion target
  const defenderX = attack.defenderVillage.xCoord;
  const defenderY = attack.defenderVillage.yCoord;

  let closestVillage = defenderVillages[0];
  let minDistance = Math.sqrt(
    Math.pow(closestVillage.xCoord - defenderX, 2) + Math.pow(closestVillage.yCoord - defenderY, 2)
  );

  for (const village of defenderVillages.slice(1)) {
    const distance = Math.sqrt(
      Math.pow(village.xCoord - defenderX, 2) + Math.pow(village.yCoord - defenderY, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestVillage = village;
    }
  }

  // Move all troops to the safe village
  // Troops will return after the attack passes (simplified - should have a return time)
  const troops = attack.defenderVillage.troops;

  if (troops.length === 0) {
    return false; // No troops to evade
  }

  // Calculate evasion travel time (troops flee at their normal speed)
  // For simplicity, we'll set them to return 1 hour after the attack arrives
  const returnTime = new Date(attack.arrivesAt.getTime() + 60 * 60 * 1000); // 1 hour after attack

  for (const troop of troops) {
    await prisma.troop.update({
      where: { id: troop.id },
      data: {
        status: 'reinforcing',
        destinationVillageId: closestVillage.id,
        arrivesAt: returnTime, // They'll return after the attack
      },
    });
  }

  // Create a game job to return the troops
  await prisma.gameJob.create({
    data: {
      type: 'troop_return_evasion',
      villageId: attack.defenderVillage.id,
      data: JSON.stringify({
        troops: troops.map((t) => ({ id: t.id, unitType: t.unitType, quantity: t.quantity })),
        fromVillageId: closestVillage.id,
      }),
      scheduledFor: returnTime,
    },
  });

  console.log(
    `Automatic evasion: ${troops.length} troop groups evaded from village ${attack.defenderVillage.name} to ${closestVillage.name}`
  );

  return true;
}

/**
 * Process the return of evaded troops
 */
export async function returnEvadedTroops(jobData: any, villageId: string): Promise<void> {
  const { troops, fromVillageId } = jobData;

  // Move troops back to their original village
  for (const troopInfo of troops) {
    const troop = await prisma.troop.findUnique({ where: { id: troopInfo.id } });

    if (troop && troop.villageId === fromVillageId) {
      // Troop is still at the safe village, send it back
      await prisma.troop.update({
        where: { id: troopInfo.id },
        data: {
          villageId: villageId,
          status: 'home',
          destinationVillageId: null,
          arrivesAt: null,
        },
      });
    }
  }

  console.log(`Evaded troops returned to village ${villageId}`);
}
