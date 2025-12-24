import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources } from '../services/resources';
import { UNIT_DATA, BUILDING_DATA, GAME_CONFIG } from '@travian/shared';
import type { UnitType, Resources } from '@travian/shared';

const router = Router();

// Get available units for training at a building
router.get('/village/:villageId/available', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: {
        buildings: true,
        troops: { where: { status: 'home' } },
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Get user's tribe
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Find which units can be trained based on buildings
    const availableUnits: any[] = [];

    for (const [unitType, unitData] of Object.entries(UNIT_DATA)) {
      // Only show units for player's tribe
      if (unitData.tribe !== user.tribe) continue;

      // Check if required building exists at required level
      const requiredBuilding = village.buildings.find(
        (b) => b.type === unitData.buildingRequirement.type && b.level >= unitData.buildingRequirement.level
      );

      if (requiredBuilding) {
        // Calculate training time with speed multiplier
        const trainingTime = Math.floor(unitData.trainingTime / GAME_CONFIG.SPEED_MULTIPLIER);

        availableUnits.push({
          type: unitType,
          name: unitData.name,
          attack: unitData.attack,
          defenseInfantry: unitData.defenseInfantry,
          defenseCavalry: unitData.defenseCavalry,
          speed: unitData.speed,
          carryCapacity: unitData.carryCapacity,
          upkeep: unitData.upkeep,
          cost: unitData.cost,
          trainingTime,
          buildingType: unitData.buildingRequirement.type,
        });
      }
    }

    // Get current troops in village
    const currentTroops = village.troops.map((t) => ({
      unitType: t.unitType,
      quantity: t.quantity,
    }));

    // Get training queue
    const trainingQueue = await prisma.gameJob.findMany({
      where: {
        villageId,
        type: 'troop_training',
        processed: false,
      },
      orderBy: { scheduledFor: 'asc' },
    });

    const queue = trainingQueue.map((job) => {
      const data = JSON.parse(job.data);
      return {
        unitType: data.unitType,
        quantity: data.quantity,
        completesAt: job.scheduledFor,
      };
    });

    res.json({
      success: true,
      data: {
        availableUnits,
        currentTroops,
        trainingQueue: queue,
      },
    });
  } catch (error) {
    console.error('Error fetching available troops:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch troops' });
  }
});

// Train troops
router.post('/village/:villageId/train', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;
    const { unitType, quantity } = req.body;

    if (!unitType || !quantity || quantity < 1) {
      return res.status(400).json({ success: false, error: 'Invalid unit type or quantity' });
    }

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { buildings: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get unit data
    const unitData = UNIT_DATA[unitType];
    if (!unitData) {
      return res.status(400).json({ success: false, error: 'Unknown unit type' });
    }

    // Check tribe
    if (unitData.tribe !== user.tribe) {
      return res.status(400).json({ success: false, error: 'Cannot train units from another tribe' });
    }

    // Check building requirement
    const requiredBuilding = village.buildings.find(
      (b) => b.type === unitData.buildingRequirement.type && b.level >= unitData.buildingRequirement.level
    );

    if (!requiredBuilding) {
      return res.status(400).json({
        success: false,
        error: `Requires ${BUILDING_DATA[unitData.buildingRequirement.type]?.name} level ${unitData.buildingRequirement.level}`,
      });
    }

    // Calculate total cost
    const totalCost: Resources = {
      lumber: unitData.cost.lumber * quantity,
      clay: unitData.cost.clay * quantity,
      iron: unitData.cost.iron * quantity,
      crop: unitData.cost.crop * quantity,
    };

    // Check resources
    const { hasEnough, current } = await hasEnoughResources(villageId, totalCost);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: totalCost, current },
      });
    }

    // Calculate training time
    const trainingTimePerUnit = Math.floor(unitData.trainingTime / GAME_CONFIG.SPEED_MULTIPLIER);
    const totalTrainingTime = trainingTimePerUnit * quantity;

    // Find last training job to queue after it
    const lastJob = await prisma.gameJob.findFirst({
      where: {
        villageId,
        type: 'troop_training',
        processed: false,
      },
      orderBy: { scheduledFor: 'desc' },
    });

    const now = new Date();
    const startTime = lastJob ? new Date(lastJob.scheduledFor) : now;
    const completesAt = new Date(startTime.getTime() + totalTrainingTime * 1000);

    // Deduct resources
    await deductResources(villageId, totalCost);

    // Create training job
    await prisma.gameJob.create({
      data: {
        type: 'troop_training',
        villageId,
        data: JSON.stringify({ unitType, quantity }),
        scheduledFor: completesAt,
      },
    });

    res.json({
      success: true,
      data: {
        unitType,
        quantity,
        completesAt: completesAt.toISOString(),
        trainingTime: totalTrainingTime,
      },
    });
  } catch (error) {
    console.error('Error training troops:', error);
    res.status(500).json({ success: false, error: 'Failed to train troops' });
  }
});

// Get troops in a village
router.get('/village/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    const troops = await prisma.troop.findMany({
      where: { villageId },
    });

    const troopsByStatus = {
      home: troops.filter((t) => t.status === 'home'),
      attacking: troops.filter((t) => t.status === 'attacking'),
      reinforcing: troops.filter((t) => t.status === 'reinforcing'),
      returning: troops.filter((t) => t.status === 'returning'),
    };

    res.json({
      success: true,
      data: {
        troops: troopsByStatus,
      },
    });
  } catch (error) {
    console.error('Error fetching troops:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch troops' });
  }
});

export { router as troopsRouter };
