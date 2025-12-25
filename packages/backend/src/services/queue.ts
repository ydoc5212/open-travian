import { prisma } from '../index';
import { hasEnoughResources, deductResources } from './resources';
import {
  BUILDING_DATA,
  RESOURCE_FIELD_DATA,
  calculateCostMultiplier,
  calculateConstructionTime,
} from '@travian/shared';
import type { BuildingType, ResourceFieldType, Resources } from '@travian/shared';

// Helper to check Plus account status
export async function checkPlusAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plusAccountUntil: true },
  });

  if (!user || !user.plusAccountUntil) return false;

  const now = new Date();
  return user.plusAccountUntil > now;
}

// Helper to get queue count for a village
export async function getQueueCount(villageId: string): Promise<number> {
  return await prisma.buildingQueue.count({
    where: { villageId },
  });
}

// Start next queued item
export async function startNextQueueItem(villageId: string) {
  // Find the next queued item (position = 1)
  const nextItem = await prisma.buildingQueue.findFirst({
    where: { villageId, position: 1 },
    orderBy: { createdAt: 'asc' },
  });

  if (!nextItem) return;

  // Get village with user info for Plus check
  const village = await prisma.village.findUnique({
    where: { id: villageId },
    include: { buildings: true, resourceFields: true, user: true },
  });

  if (!village) return;

  // Check Plus account for construction time bonus
  const hasPlusAccount = await checkPlusAccount(village.userId);

  // Get Main Building level for time reduction
  const mainBuilding = village.buildings.find((b) => b.type === 'main_building');
  const mainBuildingLevel = mainBuilding?.level || 0;

  const now = new Date();
  let endsAt: Date;

  if (nextItem.isField) {
    // Resource field upgrade
    const field = await prisma.resourceField.findUnique({
      where: { villageId_slot: { villageId, slot: nextItem.slot } },
    });

    if (!field) {
      await prisma.buildingQueue.delete({ where: { id: nextItem.id } });
      return;
    }

    const fieldData = RESOURCE_FIELD_DATA[field.type as ResourceFieldType];
    const constructionTime = calculateConstructionTime(
      fieldData.baseTime,
      nextItem.targetLevel,
      mainBuildingLevel,
      hasPlusAccount
    );

    endsAt = new Date(now.getTime() + constructionTime * 1000);

    await prisma.resourceField.update({
      where: { villageId_slot: { villageId, slot: nextItem.slot } },
      data: {
        upgradeStartedAt: now,
        upgradeEndsAt: endsAt,
      },
    });

    // Schedule completion job
    await prisma.gameJob.create({
      data: {
        type: 'field_complete',
        villageId,
        data: JSON.stringify({ slot: nextItem.slot, targetLevel: nextItem.targetLevel }),
        scheduledFor: endsAt,
      },
    });
  } else {
    // Building upgrade/construction
    const building = await prisma.building.findUnique({
      where: { villageId_slot: { villageId, slot: nextItem.slot } },
    });

    if (!building) {
      await prisma.buildingQueue.delete({ where: { id: nextItem.id } });
      return;
    }

    const buildingType = (nextItem.buildingType || building.type) as BuildingType;
    const buildingData = BUILDING_DATA[buildingType];

    const constructionTime = calculateConstructionTime(
      buildingData.baseTime,
      nextItem.targetLevel,
      mainBuildingLevel,
      hasPlusAccount
    );

    endsAt = new Date(now.getTime() + constructionTime * 1000);

    await prisma.building.update({
      where: { villageId_slot: { villageId, slot: nextItem.slot } },
      data: {
        type: buildingType,
        upgradeStartedAt: now,
        upgradeEndsAt: endsAt,
      },
    });

    // Schedule completion job
    await prisma.gameJob.create({
      data: {
        type: 'building_complete',
        villageId,
        data: JSON.stringify({ slot: nextItem.slot, targetLevel: nextItem.targetLevel }),
        scheduledFor: endsAt,
      },
    });
  }

  // Update queue positions: remove the started item and promote position 1 items
  await prisma.buildingQueue.delete({ where: { id: nextItem.id } });
}

// Calculate upgrade cost
export function calculateUpgradeCost(baseCost: Resources, targetLevel: number): Resources {
  const multiplier = calculateCostMultiplier(targetLevel);
  return {
    lumber: Math.floor(baseCost.lumber * multiplier),
    clay: Math.floor(baseCost.clay * multiplier),
    iron: Math.floor(baseCost.iron * multiplier),
    crop: Math.floor(baseCost.crop * multiplier),
  };
}
