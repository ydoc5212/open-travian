import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';
import { GAME_CONFIG, calculateDistance, calculateTravelTime } from '@travian/shared';

const router = Router();

// Adventure rewards based on difficulty
const ADVENTURE_REWARDS = {
  easy: {
    experience: [10, 20, 30],
    resources: { min: 50, max: 150 },
    silver: { min: 10, max: 30 },
  },
  medium: {
    experience: [30, 50, 70],
    resources: { min: 100, max: 300 },
    silver: { min: 30, max: 80 },
  },
  hard: {
    experience: [70, 100, 150],
    resources: { min: 200, max: 500 },
    silver: { min: 80, max: 200 },
  },
};

// GET /api/adventure - Get available adventures for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const hero = await prisma.hero.findUnique({
      where: { userId: req.userId },
      include: {
        village: {
          select: {
            id: true,
            name: true,
            xCoord: true,
            yCoord: true,
          },
        },
      },
    });

    if (!hero) {
      return res.json({ success: true, data: { adventures: [] } });
    }

    // Check for Hero's Mansion
    if (!hero.villageId) {
      return res.json({ success: true, data: { adventures: [] } });
    }

    const village = await prisma.village.findUnique({
      where: { id: hero.villageId },
      include: {
        buildings: true,
      },
    });

    if (!village) {
      return res.json({ success: true, data: { adventures: [] } });
    }

    const herosMansion = village.buildings.find((b) => b.type === 'heros_mansion');
    if (!herosMansion || !herosMansion.level) {
      return res.json({ success: true, data: { adventures: [] } });
    }

    // Get available adventures (not expired, not completed)
    const now = new Date();
    const adventures = await prisma.adventure.findMany({
      where: {
        status: {
          in: ['available', 'in_progress'],
        },
        expiresAt: {
          gt: now,
        },
        OR: [
          { heroId: null },
          { heroId: hero.id },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Calculate distance and travel time for each adventure
    const adventuresWithDetails = adventures.map((adv) => {
      const distance = calculateDistance(
        village.xCoord,
        village.yCoord,
        adv.xCoord,
        adv.yCoord
      );

      // Hero speed is 20 tiles/hour (standard hero speed)
      const travelTime = calculateTravelTime(distance, 20);

      return {
        id: adv.id,
        coordinates: { x: adv.xCoord, y: adv.yCoord },
        difficulty: adv.difficulty,
        status: adv.status,
        startedAt: adv.startedAt?.toISOString(),
        completesAt: adv.completesAt?.toISOString(),
        expiresAt: adv.expiresAt.toISOString(),
        distance: Math.round(distance * 10) / 10,
        travelTime, // in seconds
        isAssigned: adv.heroId === hero.id,
      };
    });

    res.json({
      success: true,
      data: {
        hero: {
          id: hero.id,
          name: hero.name,
          level: hero.level,
          status: hero.status,
          health: hero.health,
        },
        herosMansionLevel: herosMansion.level,
        adventures: adventuresWithDetails,
      },
    });
  } catch (error) {
    console.error('Error fetching adventures:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch adventures' });
  }
});

// POST /api/adventure/:adventureId/start - Send hero on adventure
router.post('/:adventureId/start', async (req: AuthRequest, res: Response) => {
  try {
    const { adventureId } = req.params;

    const hero = await prisma.hero.findUnique({
      where: { userId: req.userId },
      include: {
        village: {
          select: {
            id: true,
            xCoord: true,
            yCoord: true,
          },
        },
      },
    });

    if (!hero) {
      return res.status(404).json({ success: false, error: 'Hero not found' });
    }

    if (hero.status !== 'home') {
      return res.status(400).json({
        success: false,
        error: 'Hero is not available (must be at home)',
      });
    }

    if (hero.health <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Hero has no health',
      });
    }

    if (!hero.village) {
      return res.status(400).json({
        success: false,
        error: 'Hero must be in a village',
      });
    }

    // Get adventure
    const adventure = await prisma.adventure.findUnique({
      where: { id: adventureId },
    });

    if (!adventure) {
      return res.status(404).json({ success: false, error: 'Adventure not found' });
    }

    if (adventure.status !== 'available') {
      return res.status(400).json({
        success: false,
        error: 'Adventure is not available',
      });
    }

    // Check if adventure expired
    const now = new Date();
    if (adventure.expiresAt < now) {
      return res.status(400).json({
        success: false,
        error: 'Adventure has expired',
      });
    }

    // Calculate travel time
    const distance = calculateDistance(
      hero.village.xCoord,
      hero.village.yCoord,
      adventure.xCoord,
      adventure.yCoord
    );
    const travelTime = calculateTravelTime(distance, 20); // Hero speed 20 tiles/hour
    const completionTime = travelTime * 2; // Round trip
    const completesAt = new Date(now.getTime() + completionTime * 1000);

    // Update adventure and hero status
    await prisma.$transaction([
      prisma.adventure.update({
        where: { id: adventureId },
        data: {
          heroId: hero.id,
          status: 'in_progress',
          startedAt: now,
          completesAt,
        },
      }),
      prisma.hero.update({
        where: { id: hero.id },
        data: {
          status: 'adventure',
        },
      }),
    ]);

    // Schedule job for adventure completion
    await prisma.gameJob.create({
      data: {
        type: 'adventure_complete',
        villageId: hero.villageId!,
        data: JSON.stringify({
          adventureId,
          heroId: hero.id,
          difficulty: adventure.difficulty,
        }),
        scheduledFor: completesAt,
      },
    });

    res.json({
      success: true,
      data: {
        adventure: {
          id: adventure.id,
          coordinates: { x: adventure.xCoord, y: adventure.yCoord },
          difficulty: adventure.difficulty,
          completesAt: completesAt.toISOString(),
          travelTime: completionTime,
        },
      },
    });
  } catch (error) {
    console.error('Error starting adventure:', error);
    res.status(500).json({ success: false, error: 'Failed to start adventure' });
  }
});

// Helper function to generate random adventures (called by game job scheduler)
export async function generateAdventures() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000 / GAME_CONFIG.SPEED_MULTIPLIER);

  // Generate 5-10 random adventures across the map
  const adventureCount = Math.floor(Math.random() * 6) + 5;
  const difficulties = ['easy', 'medium', 'hard'];

  for (let i = 0; i < adventureCount; i++) {
    const x = Math.floor(Math.random() * (GAME_CONFIG.MAP_MAX - GAME_CONFIG.MAP_MIN + 1)) + GAME_CONFIG.MAP_MIN;
    const y = Math.floor(Math.random() * (GAME_CONFIG.MAP_MAX - GAME_CONFIG.MAP_MIN + 1)) + GAME_CONFIG.MAP_MIN;
    const difficulty = difficulties[Math.floor(Math.random() * difficulties.length)];

    // Check if adventure already exists at this location
    const existing = await prisma.adventure.findUnique({
      where: { xCoord_yCoord: { xCoord: x, yCoord: y } },
    });

    if (!existing) {
      await prisma.adventure.create({
        data: {
          xCoord: x,
          yCoord: y,
          difficulty,
          status: 'available',
          expiresAt,
        },
      });
    }
  }

  // Clean up expired adventures
  await prisma.adventure.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });
}

export { router as adventureRouter };
