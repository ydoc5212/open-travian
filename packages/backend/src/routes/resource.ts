import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources, updateVillageResources } from '../services/resources';
import {
  RESOURCE_FIELD_DATA,
  calculateCostMultiplier,
  calculateConstructionTime,
} from '@travian/shared';
import type { ResourceFieldType, Resources } from '@travian/shared';

const router = Router();

// Calculate cost for upgrading resource field to a specific level
function calculateFieldUpgradeCost(baseCost: Resources, targetLevel: number): Resources {
  const multiplier = calculateCostMultiplier(targetLevel);
  return {
    lumber: Math.floor(baseCost.lumber * multiplier),
    clay: Math.floor(baseCost.clay * multiplier),
    iron: Math.floor(baseCost.iron * multiplier),
    crop: Math.floor(baseCost.crop * multiplier),
  };
}

// Get resource field info
router.get('/village/:villageId/field/:slot', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, slot } = req.params;
    const slotNum = parseInt(slot, 10);

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const field = await prisma.resourceField.findUnique({
      where: { villageId_slot: { villageId, slot: slotNum } },
    });

    if (!field) {
      return res.status(404).json({ success: false, error: 'Resource field not found' });
    }

    const fieldData = RESOURCE_FIELD_DATA[field.type as ResourceFieldType];
    const nextLevel = field.level + 1;
    const maxLevel = village.isCapital ? 20 : 10; // Capital can upgrade to 20
    const canUpgrade = nextLevel <= maxLevel;

    res.json({
      success: true,
      data: {
        slot: slotNum,
        type: field.type,
        name: fieldData.name,
        level: field.level,
        maxLevel,
        produces: fieldData.produces,
        upgradeEndsAt: field.upgradeEndsAt,
        canUpgrade,
        upgradeCost: canUpgrade ? calculateFieldUpgradeCost(fieldData.baseCost, nextLevel) : null,
      },
    });
  } catch (error) {
    console.error('Error fetching resource field:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch resource field' });
  }
});

// Upgrade resource field
router.post('/village/:villageId/field/:slot/upgrade', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, slot } = req.params;
    const slotNum = parseInt(slot, 10);

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { resourceFields: true, buildings: true, user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check if there's already a construction in progress
    const fieldInProgress = village.resourceFields.find((f) => f.upgradeEndsAt !== null);
    const buildingInProgress = village.buildings.find((b) => b.upgradeEndsAt !== null);
    const hasActiveConstruction = fieldInProgress || buildingInProgress;

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

    const field = await prisma.resourceField.findUnique({
      where: { villageId_slot: { villageId, slot: slotNum } },
    });

    if (!field) {
      return res.status(404).json({ success: false, error: 'Resource field not found' });
    }

    const fieldData = RESOURCE_FIELD_DATA[field.type as ResourceFieldType];
    const targetLevel = field.level + 1;
    const maxLevel = village.isCapital ? 20 : 10;

    if (targetLevel > maxLevel) {
      return res.status(400).json({ success: false, error: 'Resource field is at max level' });
    }

    // Calculate cost
    const cost = calculateFieldUpgradeCost(fieldData.baseCost, targetLevel);

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
      fieldData.baseTime,
      targetLevel,
      mainBuildingLevel,
      hasPlusAccount
    );

    if (!hasActiveConstruction) {
      // Start construction immediately
      const endsAt = new Date(now.getTime() + constructionTime * 1000);

      await prisma.resourceField.update({
        where: { villageId_slot: { villageId, slot: slotNum } },
        data: {
          upgradeStartedAt: now,
          upgradeEndsAt: endsAt,
        },
      });

      // Schedule job for completion
      await prisma.gameJob.create({
        data: {
          type: 'field_complete',
          villageId,
          data: JSON.stringify({ slot: slotNum, targetLevel }),
          scheduledFor: endsAt,
        },
      });

      res.json({
        success: true,
        data: {
          slot: slotNum,
          type: field.type,
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
          isField: true,
          buildingType: null,
          targetLevel,
          position: 1, // Queued position
        },
      });

      res.json({
        success: true,
        data: {
          slot: slotNum,
          type: field.type,
          targetLevel,
          constructionTime,
          queued: true,
        },
      });
    }
  } catch (error) {
    console.error('Error upgrading resource field:', error);
    res.status(500).json({ success: false, error: 'Failed to upgrade resource field' });
  }
});

// Get current resources (updates and returns current calculated values)
router.get('/village/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const resources = await updateVillageResources(villageId);

    res.json({
      success: true,
      data: resources,
    });
  } catch (error) {
    console.error('Error fetching resources:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch resources' });
  }
});

export { router as resourceRouter };
