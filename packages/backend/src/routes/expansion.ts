import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources } from '../services/resources';
import { GAME_CONFIG, UNIT_DATA, calculateDistance, calculateTravelTime, RESOURCE_FIELD_DATA } from '@travian/shared';
import type { CelebrationType } from '@travian/shared';

const router = Router();

// Get expansion status (how many villages player has vs can have)
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const villages = await prisma.village.findMany({
      where: { userId: req.userId },
      select: { id: true, name: true, isCapital: true },
    });

    // In a full implementation, max villages would depend on culture points
    // For now, use a simple base limit
    const maxVillages = GAME_CONFIG.MAX_VILLAGES_BASE;

    res.json({
      success: true,
      data: {
        currentVillages: villages.length,
        maxVillages,
        canFoundMore: villages.length < maxVillages,
        villages: villages.map((v) => ({
          id: v.id,
          name: v.name,
          isCapital: v.isCapital,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching expansion status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch expansion status' });
  }
});

// Found a new village with settlers
router.post('/found-village', async (req: AuthRequest, res: Response) => {
  try {
    const { fromVillageId, x, y, villageName } = req.body;

    if (!fromVillageId || x === undefined || y === undefined || !villageName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // Validate coordinates
    if (
      x < GAME_CONFIG.MAP_MIN ||
      x > GAME_CONFIG.MAP_MAX ||
      y < GAME_CONFIG.MAP_MIN ||
      y > GAME_CONFIG.MAP_MAX
    ) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }

    // Validate village name
    if (villageName.length < 2 || villageName.length > 30) {
      return res.status(400).json({
        success: false,
        error: 'Village name must be between 2 and 30 characters',
      });
    }

    // Get source village
    const sourceVillage = await prisma.village.findFirst({
      where: { id: fromVillageId, userId: req.userId },
      include: {
        troops: { where: { status: 'home' } },
        user: { select: { tribe: true } },
      },
    });

    if (!sourceVillage) {
      return res.status(404).json({ success: false, error: 'Source village not found' });
    }

    // Check if target coordinates are available
    const existingVillage = await prisma.village.findUnique({
      where: { xCoord_yCoord: { xCoord: x, yCoord: y } },
    });

    if (existingVillage) {
      return res.status(400).json({ success: false, error: 'Location already occupied' });
    }

    // Check if player has reached max villages
    const playerVillages = await prisma.village.count({
      where: { userId: req.userId },
    });

    if (playerVillages >= GAME_CONFIG.MAX_VILLAGES_BASE) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${GAME_CONFIG.MAX_VILLAGES_BASE} villages reached`,
      });
    }

    // Find the settler unit type for this tribe
    const tribe = sourceVillage.user.tribe;
    const settlerType = `${tribe}_settler` as const;
    const settlerData = UNIT_DATA[settlerType];

    if (!settlerData) {
      return res.status(500).json({ success: false, error: 'Invalid tribe settler data' });
    }

    // Check if player has enough settlers
    const settlerTroop = sourceVillage.troops.find((t) => t.unitType === settlerType);

    if (!settlerTroop || settlerTroop.quantity < GAME_CONFIG.SETTLERS_REQUIRED) {
      return res.status(400).json({
        success: false,
        error: `You need ${GAME_CONFIG.SETTLERS_REQUIRED} settlers to found a new village`,
      });
    }

    // Calculate travel time
    const distance = calculateDistance(sourceVillage.xCoord, sourceVillage.yCoord, x, y);
    const travelTime = calculateTravelTime(distance, settlerData.speed);
    const now = new Date();
    const arrivesAt = new Date(now.getTime() + travelTime * 1000);

    // Send settlers (deduct from village and create a job)
    await prisma.$transaction(async (tx) => {
      // Deduct settlers
      const newQuantity = settlerTroop.quantity - GAME_CONFIG.SETTLERS_REQUIRED;
      if (newQuantity <= 0) {
        await tx.troop.delete({ where: { id: settlerTroop.id } });
      } else {
        await tx.troop.update({
          where: { id: settlerTroop.id },
          data: { quantity: newQuantity },
        });
      }

      // Create traveling settlers
      await tx.troop.create({
        data: {
          villageId: fromVillageId,
          unitType: settlerType,
          quantity: GAME_CONFIG.SETTLERS_REQUIRED,
          status: 'attacking', // Reuse attacking status for settlers
          destinationVillageId: null,
          arrivesAt,
        },
      });

      // Schedule village founding job
      await tx.gameJob.create({
        data: {
          type: 'settlers_arrive',
          villageId: fromVillageId,
          data: JSON.stringify({
            fromVillageId,
            x,
            y,
            villageName,
            settlerType,
          }),
          scheduledFor: arrivesAt,
        },
      });
    });

    res.json({
      success: true,
      data: {
        arrivesAt: arrivesAt.toISOString(),
        travelTime,
        distance: Math.round(distance * 10) / 10,
        coordinates: { x, y },
      },
    });
  } catch (error) {
    console.error('Error founding village:', error);
    res.status(500).json({ success: false, error: 'Failed to found village' });
  }
});

// Start a celebration (small or large)
router.post('/celebrate', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId, type } = req.body;

    if (!villageId || !type) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (type !== 'small' && type !== 'large') {
      return res.status(400).json({ success: false, error: 'Invalid celebration type' });
    }

    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { buildings: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check if already celebrating
    if (village.celebrationEndsAt && new Date() < new Date(village.celebrationEndsAt)) {
      return res.status(400).json({ success: false, error: 'Celebration already in progress' });
    }

    // Check if town hall exists and meets requirements
    const townHall = village.buildings.find((b) => b.type === 'town_hall');
    if (!townHall || townHall.level < 1) {
      return res.status(400).json({ success: false, error: 'Requires Town Hall level 1' });
    }

    // Large celebration requires Town Hall level 10
    if (type === 'large' && townHall.level < 10) {
      return res.status(400).json({ success: false, error: 'Large celebration requires Town Hall level 10' });
    }

    // Get celebration cost and duration
    const cost =
      type === 'small' ? GAME_CONFIG.SMALL_CELEBRATION_COST : GAME_CONFIG.LARGE_CELEBRATION_COST;
    const duration =
      type === 'small'
        ? GAME_CONFIG.SMALL_CELEBRATION_DURATION
        : GAME_CONFIG.LARGE_CELEBRATION_DURATION;

    // Check resources
    const { hasEnough, current } = await hasEnoughResources(villageId, cost);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: cost, current },
      });
    }

    // Calculate when celebration ends (apply speed multiplier)
    const adjustedDuration = Math.floor(duration / GAME_CONFIG.SPEED_MULTIPLIER);
    const now = new Date();
    const endsAt = new Date(now.getTime() + adjustedDuration * 1000);

    // Deduct resources and start celebration
    await prisma.$transaction(async (tx) => {
      await deductResources(villageId, cost);

      await tx.village.update({
        where: { id: villageId },
        data: {
          celebrationEndsAt: endsAt,
          celebrationType: type,
        },
      });

      // Schedule celebration completion job
      await tx.gameJob.create({
        data: {
          type: 'celebration_complete',
          villageId,
          data: JSON.stringify({ type }),
          scheduledFor: endsAt,
        },
      });
    });

    res.json({
      success: true,
      data: {
        type,
        endsAt: endsAt.toISOString(),
        duration: adjustedDuration,
      },
    });
  } catch (error) {
    console.error('Error starting celebration:', error);
    res.status(500).json({ success: false, error: 'Failed to start celebration' });
  }
});

export { router as expansionRouter };
