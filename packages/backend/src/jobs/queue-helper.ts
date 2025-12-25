// Helper functions for building queue management
import { prisma } from '../index';
import {
  BUILDING_DATA,
  RESOURCE_FIELD_DATA,
  calculateConstructionTime,
} from '@travian/shared';
import type { BuildingType, ResourceFieldType } from '@travian/shared';

// Auto-start next queued item after a construction completes
export async function startNextQueuedItem(villageId: string) {
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

  if (!village) {
    await prisma.buildingQueue.delete({ where: { id: nextItem.id } });
    return;
  }

  // Check Plus account for construction time bonus
  const now = new Date();
  const hasPlusAccount = !!(village.user.plusAccountUntil && village.user.plusAccountUntil > now);

  // Get Main Building level for time reduction
  const mainBuilding = village.buildings.find((b) => b.type === 'main_building');
  const mainBuildingLevel = mainBuilding?.level || 0;

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

  // Remove the started item from queue
  await prisma.buildingQueue.delete({ where: { id: nextItem.id } });

  console.log(`Auto-started queued ${nextItem.isField ? 'field' : 'building'} at slot ${nextItem.slot}`);
}
