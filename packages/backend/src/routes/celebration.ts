import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { hasEnoughResources, deductResources } from '../services/resources';
import { GAME_CONFIG } from '@travian/shared';

const router = Router();

// Celebration costs and culture points
const SMALL_CELEBRATION = {
  cost: { lumber: 6400, clay: 6650, iron: 5940, crop: 1340 },
  duration: 3600, // 1 hour in seconds (before speed multiplier)
  culturePoints: 500,
};

const LARGE_CELEBRATION = {
  cost: { lumber: 29700, clay: 33250, iron: 32000, crop: 6700 },
  duration: 86400, // 24 hours in seconds (before speed multiplier)
  culturePoints: 2000,
};

// GET /api/celebration/:villageId - Get active celebration
router.get('/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    // Verify village ownership
    const village = await prisma.village.findFirst({
      where: {
        id: villageId,
        userId: req.userId,
      },
      include: {
        buildings: true,
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check for Town Hall
    const townHall = village.buildings.find((b) => b.type === 'town_hall');
    if (!townHall) {
      return res.status(400).json({
        success: false,
        error: 'Village does not have a Town Hall',
      });
    }

    // Get active celebration
    const now = new Date();
    const activeCelebration = await prisma.celebration.findFirst({
      where: {
        villageId,
        endsAt: {
          gt: now,
        },
      },
      orderBy: {
        endsAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: {
        townHallLevel: townHall.level,
        activeCelebration: activeCelebration
          ? {
              id: activeCelebration.id,
              type: activeCelebration.type,
              startedAt: activeCelebration.startedAt.toISOString(),
              endsAt: activeCelebration.endsAt.toISOString(),
              culturePoints: activeCelebration.culturePoints,
            }
          : null,
        smallCelebration: SMALL_CELEBRATION,
        largeCelebration: LARGE_CELEBRATION,
      },
    });
  } catch (error) {
    console.error('Error fetching celebration:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch celebration' });
  }
});

// POST /api/celebration/:villageId/start - Start a celebration
router.post('/:villageId/start', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;
    const { type } = req.body; // 'small' | 'large'

    if (!type || (type !== 'small' && type !== 'large')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid celebration type. Must be "small" or "large"',
      });
    }

    // Verify village ownership
    const village = await prisma.village.findFirst({
      where: {
        id: villageId,
        userId: req.userId,
      },
      include: {
        buildings: true,
      },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Check for Town Hall
    const townHall = village.buildings.find((b) => b.type === 'town_hall');
    if (!townHall || !townHall.level) {
      return res.status(400).json({
        success: false,
        error: 'Village does not have a Town Hall',
      });
    }

    // Check for active celebration
    const now = new Date();
    const activeCelebration = await prisma.celebration.findFirst({
      where: {
        villageId,
        endsAt: {
          gt: now,
        },
      },
    });

    if (activeCelebration) {
      return res.status(400).json({
        success: false,
        error: 'A celebration is already in progress',
      });
    }

    // Get celebration data
    const celebrationData = type === 'small' ? SMALL_CELEBRATION : LARGE_CELEBRATION;

    // Check resources
    const { hasEnough, current } = await hasEnoughResources(villageId, celebrationData.cost);
    if (!hasEnough) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: { required: celebrationData.cost, current },
      });
    }

    // Deduct resources
    await deductResources(villageId, celebrationData.cost);

    // Calculate end time with speed multiplier
    const duration = celebrationData.duration / GAME_CONFIG.SPEED_MULTIPLIER;
    const endsAt = new Date(now.getTime() + duration * 1000);

    // Create celebration
    const celebration = await prisma.celebration.create({
      data: {
        villageId,
        type,
        startedAt: now,
        endsAt,
        completesAt: endsAt,
        culturePoints: celebrationData.culturePoints,
      },
    });

    // Schedule job for completion
    await prisma.gameJob.create({
      data: {
        type: 'celebration_complete',
        villageId,
        data: JSON.stringify({
          celebrationId: celebration.id,
          culturePoints: celebrationData.culturePoints,
        }),
        scheduledFor: endsAt,
      },
    });

    res.json({
      success: true,
      data: {
        celebration: {
          id: celebration.id,
          type: celebration.type,
          startedAt: celebration.startedAt.toISOString(),
          endsAt: celebration.endsAt.toISOString(),
          culturePoints: celebration.culturePoints,
        },
      },
    });
  } catch (error) {
    console.error('Error starting celebration:', error);
    res.status(500).json({ success: false, error: 'Failed to start celebration' });
  }
});

export { router as celebrationRouter };
