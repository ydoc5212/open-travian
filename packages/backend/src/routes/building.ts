import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources } from '../services/resources';
import {
  BUILDING_DATA,
  RESOURCE_FIELD_DATA,
  calculateCostMultiplier,
  calculateConstructionTime,
  GAME_CONFIG,
} from '@travian/shared';
import type { BuildingType, ResourceFieldType, Resources } from '@travian/shared';

const router = Router();

// Helper to check building prerequisites
async function checkPrerequisites(
  villageId: string,
  buildingType: BuildingType
): Promise<{ met: boolean; missing: string[] }> {
  const buildingData = BUILDING_DATA[buildingType];
  if (!buildingData) {
    return { met: false, missing: [`Unknown building type: ${buildingType}`] };
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    include: { buildings: true, resourceFields: true },
  });

  if (!village) {
    return { met: false, missing: ['Village not found'] };
  }

  const missing: string[] = [];

  for (const prereq of buildingData.prerequisites) {
    // Check if it's a building or resource field prerequisite
    if (prereq.type in BUILDING_DATA) {
      const building = village.buildings.find((b) => b.type === prereq.type);
      if (!building || building.level < prereq.level) {
        const prereqName = BUILDING_DATA[prereq.type as BuildingType]?.name || prereq.type;
        missing.push(`${prereqName} level ${prereq.level}`);
      }
    } else if (prereq.type in RESOURCE_FIELD_DATA) {
      // For resource field prerequisites (rare, but possible)
      const fields = village.resourceFields.filter((f) => f.type === prereq.type);
      const maxLevel = Math.max(...fields.map((f) => f.level), 0);
      if (maxLevel < prereq.level) {
        const fieldName = RESOURCE_FIELD_DATA[prereq.type as ResourceFieldType]?.name || prereq.type;
        missing.push(`${fieldName} level ${prereq.level}`);
      }
    }
  }

  return { met: missing.length === 0, missing };
}

// Calculate cost for upgrading to a specific level
function calculateUpgradeCost(baseCost: Resources, targetLevel: number): Resources {
  const multiplier = calculateCostMultiplier(targetLevel);
  return {
    lumber: Math.floor(baseCost.lumber * multiplier),
    clay: Math.floor(baseCost.clay * multiplier),
    iron: Math.floor(baseCost.iron * multiplier),
    crop: Math.floor(baseCost.crop * multiplier),
  };
}

// Get building info for a specific slot
router.get('/village/:villageId/slot/:slot', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, slot } = req.params;
    const slotNum = parseInt(slot, 10);

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const building = await prisma.building.findUnique({
      where: { villageId_slot: { villageId, slot: slotNum } },
    });

    if (!building) {
      return res.status(404).json({ success: false, error: 'Building slot not found' });
    }

    // If slot is empty, return available buildings
    if (!building.type) {
      // Get list of buildings that can be built
      const availableBuildings = Object.entries(BUILDING_DATA)
        .filter(([type, data]) => {
          // Filter out tribe-specific buildings for other tribes
          if (data.tribe) {
            const user = req.user;
            if (user && data.tribe !== user.tribe) return false;
          }
          return true;
        })
        .map(([type, data]) => ({
          type,
          name: data.name,
          description: data.description,
          cost: calculateUpgradeCost(data.baseCost, 1),
        }));

      return res.json({
        success: true,
        data: {
          slot: slotNum,
          type: null,
          level: 0,
          availableBuildings,
        },
      });
    }

    // Return existing building info with upgrade cost
    const buildingData = BUILDING_DATA[building.type as BuildingType];
    const nextLevel = building.level + 1;
    const canUpgrade = nextLevel <= buildingData.maxLevel;

    res.json({
      success: true,
      data: {
        slot: slotNum,
        type: building.type,
        name: buildingData.name,
        level: building.level,
        maxLevel: buildingData.maxLevel,
        description: buildingData.description,
        upgradeEndsAt: building.upgradeEndsAt,
        canUpgrade,
        upgradeCost: canUpgrade ? calculateUpgradeCost(buildingData.baseCost, nextLevel) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching building:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch building' });
  }
});

// Build or upgrade a building
router.post('/village/:villageId/slot/:slot/upgrade', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, slot } = req.params;
    const { buildingType } = req.body; // Only needed for new construction
    const slotNum = parseInt(slot, 10);

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { buildings: true, resourceFields: true, user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check if there's already a construction in progress
    const constructionInProgress = village.buildings.find((b) => b.upgradeEndsAt !== null);
    const fieldInProgress = village.resourceFields.find((f) => f.upgradeEndsAt !== null);
    const hasActiveConstruction = constructionInProgress || fieldInProgress;

    // Check Plus account status
    const now = new Date();
    const hasPlusAccount = !!(village.user.plusAccountUntil && village.user.plusAccountUntil > now);

    // Check current queue size
    const queueCount = await prisma.buildingQueue.count({ where: { villageId } });

    // If construction in progress and no Plus, reject
    if (hasActiveConstruction && !hasPlusAccount) {
      return res.status(400).json({
        success: false,
        error: 'Another construction is already in progress. Upgrade to Plus to use building queue!',
      });
    }

    // If queue already has 1 item (max for Plus), reject
    if (queueCount >= 1 && hasPlusAccount) {
      return res.status(400).json({
        success: false,
        error: 'Building queue is full (max 2 items with Plus account)',
      });
    }

    const building = await prisma.building.findUnique({
      where: { villageId_slot: { villageId, slot: slotNum } },
    });

    if (!building) {
      return res.status(404).json({ success: false, error: 'Building slot not found' });
    }

    let targetType: BuildingType;
    let targetLevel: number;

    if (!building.type) {
      // New construction
      if (!buildingType || !(buildingType in BUILDING_DATA)) {
        return res.status(400).json({ success: false, error: 'Invalid building type' });
      }
      targetType = buildingType as BuildingType;
      targetLevel = 1;
    } else {
      // Upgrade existing
      targetType = building.type as BuildingType;
      targetLevel = building.level + 1;
    }

    const buildingData = BUILDING_DATA[targetType];

    // Check max level
    if (targetLevel > buildingData.maxLevel) {
      return res.status(400).json({ success: false, error: 'Building is at max level' });
    }

    // Check tribe restriction
    if (buildingData.tribe && req.user && buildingData.tribe !== req.user.tribe) {
      return res.status(400).json({
        success: false,
        error: `This building is only available to ${buildingData.tribe}`,
      });
    }

    // Check prerequisites
    const prereqs = await checkPrerequisites(villageId, targetType);
    if (!prereqs.met) {
      return res.status(400).json({
        success: false,
        error: `Prerequisites not met: ${prereqs.missing.join(', ')}`,
      });
    }

    // Calculate cost
    const cost = calculateUpgradeCost(buildingData.baseCost, targetLevel);

    // Check resources
    const { hasEnough, current } = await hasEnoughResources(villageId, cost);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: cost, current },
      });
    }

    // Deduct resources immediately (whether starting now or queuing)
    await deductResources(villageId, cost);

    // Get Main Building level for time reduction
    const mainBuilding = village.buildings.find((b) => b.type === 'main_building');
    const mainBuildingLevel = mainBuilding?.level || 0;

    // Calculate construction time
    const constructionTime = calculateConstructionTime(
      buildingData.baseTime,
      targetLevel,
      mainBuildingLevel,
      hasPlusAccount
    );

    if (!hasActiveConstruction) {
      // Start construction immediately
      const endsAt = new Date(now.getTime() + constructionTime * 1000);

      await prisma.building.update({
        where: { villageId_slot: { villageId, slot: slotNum } },
        data: {
          type: targetType,
          upgradeStartedAt: now,
          upgradeEndsAt: endsAt,
        },
      });

      // Schedule job for completion
      await prisma.gameJob.create({
        data: {
          type: 'building_complete',
          villageId,
          data: JSON.stringify({ slot: slotNum, targetLevel }),
          scheduledFor: endsAt,
        },
      });

      res.json({
        success: true,
        data: {
          slot: slotNum,
          type: targetType,
          targetLevel,
          endsAt: endsAt.toISOString(),
          constructionTime,
          queued: false,
        },
      });
    } else {
      // Add to queue
      await prisma.buildingQueue.create({
        data: {
          villageId,
          slot: slotNum,
          isField: false,
          buildingType: !building.type ? targetType : null,
          targetLevel,
          position: 1, // Queued position
        },
      });

      res.json({
        success: true,
        data: {
          slot: slotNum,
          type: targetType,
          targetLevel,
          constructionTime,
          queued: true,
        },
      });
    }
  } catch (error) {
    console.error('Error upgrading building:', error);
    res.status(500).json({ success: false, error: 'Failed to upgrade building' });
  }
});

// Cancel construction (optional feature)
router.post('/village/:villageId/slot/:slot/cancel', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, slot } = req.params;
    const slotNum = parseInt(slot, 10);

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const building = await prisma.building.findUnique({
      where: { villageId_slot: { villageId, slot: slotNum } },
    });

    if (!building || !building.upgradeEndsAt) {
      return res.status(400).json({ success: false, error: 'No construction in progress' });
    }

    // Cancel construction (no refund in classic Travian)
    await prisma.building.update({
      where: { villageId_slot: { villageId, slot: slotNum } },
      data: {
        upgradeStartedAt: null,
        upgradeEndsAt: null,
      },
    });

    // Remove scheduled job
    await prisma.gameJob.deleteMany({
      where: {
        villageId,
        type: 'building_complete',
        data: { contains: `"slot":${slotNum}` },
        processed: false,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error canceling construction:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel construction' });
  }
});

export { router as buildingRouter };
