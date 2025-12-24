import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { calculateVillageResources, updateVillageResources } from '../services/resources';

const router = Router();

// Get all villages for current user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const villages = await prisma.village.findMany({
      where: { userId: req.userId },
      include: {
        resourceFields: true,
        buildings: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate current resources for each village
    const villagesWithResources = await Promise.all(
      villages.map(async (village) => {
        const resources = await calculateVillageResources(village.id);
        return {
          id: village.id,
          name: village.name,
          coordinates: { x: village.xCoord, y: village.yCoord },
          isCapital: village.isCapital,
          population: village.population,
          resources: {
            lumber: resources.lumber,
            clay: resources.clay,
            iron: resources.iron,
            crop: resources.crop,
          },
          warehouseCapacity: resources.warehouseCapacity,
          granaryCapacity: resources.granaryCapacity,
          production: resources.production,
        };
      })
    );

    res.json({ success: true, data: { villages: villagesWithResources } });
  } catch (error) {
    console.error('Error fetching villages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch villages' });
  }
});

// Get single village with full details
router.get('/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    const village = await prisma.village.findFirst({
      where: {
        id: villageId,
        userId: req.userId,
      },
      include: {
        resourceFields: {
          orderBy: { slot: 'asc' },
        },
        buildings: {
          orderBy: { slot: 'asc' },
        },
        troops: {
          where: { status: 'home' },
        },
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Update and get current resources
    const resources = await updateVillageResources(village.id);

    res.json({
      success: true,
      data: {
        village: {
          id: village.id,
          name: village.name,
          coordinates: { x: village.xCoord, y: village.yCoord },
          isCapital: village.isCapital,
          population: village.population,
          loyalty: village.loyalty,
          resources: {
            lumber: resources.lumber,
            clay: resources.clay,
            iron: resources.iron,
            crop: resources.crop,
          },
          warehouseCapacity: resources.warehouseCapacity,
          granaryCapacity: resources.granaryCapacity,
          production: resources.production,
          cropConsumption: resources.cropConsumption,
          resourceFields: village.resourceFields.map((field) => ({
            id: field.id,
            slot: field.slot,
            type: field.type,
            level: field.level,
            upgradeEndsAt: field.upgradeEndsAt,
          })),
          buildings: village.buildings.map((building) => ({
            id: building.id,
            slot: building.slot,
            type: building.type,
            level: building.level,
            upgradeEndsAt: building.upgradeEndsAt,
          })),
          troops: village.troops.map((troop) => ({
            unitType: troop.unitType,
            quantity: troop.quantity,
          })),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching village:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch village' });
  }
});

// Rename village
router.patch('/:villageId/name', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;
    const { name } = req.body;

    if (!name || name.length < 2 || name.length > 30) {
      return res.status(400).json({
        success: false,
        error: 'Village name must be between 2 and 30 characters',
      });
    }

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    await prisma.village.update({
      where: { id: villageId },
      data: { name },
    });

    res.json({ success: true, data: { name } });
  } catch (error) {
    console.error('Error renaming village:', error);
    res.status(500).json({ success: false, error: 'Failed to rename village' });
  }
});

export { router as villageRouter };
