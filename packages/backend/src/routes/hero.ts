import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Constants
const REVIVE_BASE_COST = {
  lumber: 100,
  clay: 100,
  iron: 100,
  crop: 100,
};

const REVIVE_TIME_HOURS = 24; // Hero can be revived after 24 hours

// GET /api/hero - Get user's hero info
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const hero = await prisma.hero.findUnique({
      where: { userId: req.userId },
      include: {
        items: true,
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
      return res.json({ success: true, data: { hero: null } });
    }

    res.json({
      success: true,
      data: {
        hero: {
          id: hero.id,
          name: hero.name,
          level: hero.level,
          experience: hero.experience,
          health: hero.health,
          strength: hero.strength,
          offBonus: hero.offBonus,
          defBonus: hero.defBonus,
          productionBonus: hero.productionBonus,
          status: hero.status,
          revivedAt: hero.revivedAt,
          village: hero.village ? {
            id: hero.village.id,
            name: hero.village.name,
            coordinates: {
              x: hero.village.xCoord,
              y: hero.village.yCoord,
            },
          } : null,
          items: hero.items.map((item) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            bonus: JSON.parse(item.bonus),
          })),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching hero:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch hero' });
  }
});

// POST /api/hero/create - Create hero (first time only)
router.post('/create', async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.length < 2 || name.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Hero name must be between 2 and 20 characters',
      });
    }

    // Check if hero already exists
    const existingHero = await prisma.hero.findUnique({
      where: { userId: req.userId },
    });

    if (existingHero) {
      return res.status(400).json({
        success: false,
        error: 'You already have a hero',
      });
    }

    // Get user's first village
    const village = await prisma.village.findFirst({
      where: { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    });

    if (!village) {
      return res.status(400).json({
        success: false,
        error: 'You need a village before creating a hero',
      });
    }

    // Create hero
    const hero = await prisma.hero.create({
      data: {
        userId: req.userId!,
        name,
        villageId: village.id,
        status: 'home',
      },
      include: {
        items: true,
      },
    });

    res.json({
      success: true,
      data: {
        hero: {
          id: hero.id,
          name: hero.name,
          level: hero.level,
          experience: hero.experience,
          health: hero.health,
          strength: hero.strength,
          offBonus: hero.offBonus,
          defBonus: hero.defBonus,
          productionBonus: hero.productionBonus,
          status: hero.status,
          revivedAt: hero.revivedAt,
          village: {
            id: village.id,
            name: village.name,
            coordinates: {
              x: village.xCoord,
              y: village.yCoord,
            },
          },
          items: [],
        },
      },
    });
  } catch (error) {
    console.error('Error creating hero:', error);
    res.status(500).json({ success: false, error: 'Failed to create hero' });
  }
});

// PUT /api/hero/assign/:villageId - Assign hero to village
router.put('/assign/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    // Get hero
    const hero = await prisma.hero.findUnique({
      where: { userId: req.userId },
    });

    if (!hero) {
      return res.status(404).json({ success: false, error: 'Hero not found' });
    }

    // Check hero status
    if (hero.status === 'dead') {
      return res.status(400).json({
        success: false,
        error: 'Cannot assign dead hero. Revive first.',
      });
    }

    if (hero.status === 'adventure') {
      return res.status(400).json({
        success: false,
        error: 'Hero is on an adventure',
      });
    }

    // Verify village ownership
    const village = await prisma.village.findFirst({
      where: {
        id: villageId,
        userId: req.userId,
      },
    });

    if (!village) {
      return res.status(404).json({
        success: false,
        error: 'Village not found or not owned by you',
      });
    }

    // Update hero location
    const updatedHero = await prisma.hero.update({
      where: { id: hero.id },
      data: { villageId },
      include: {
        items: true,
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

    res.json({
      success: true,
      data: {
        hero: {
          id: updatedHero.id,
          name: updatedHero.name,
          level: updatedHero.level,
          experience: updatedHero.experience,
          health: updatedHero.health,
          strength: updatedHero.strength,
          offBonus: updatedHero.offBonus,
          defBonus: updatedHero.defBonus,
          productionBonus: updatedHero.productionBonus,
          status: updatedHero.status,
          revivedAt: updatedHero.revivedAt,
          village: updatedHero.village ? {
            id: updatedHero.village.id,
            name: updatedHero.village.name,
            coordinates: {
              x: updatedHero.village.xCoord,
              y: updatedHero.village.yCoord,
            },
          } : null,
          items: updatedHero.items.map((item) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            bonus: JSON.parse(item.bonus),
          })),
        },
      },
    });
  } catch (error) {
    console.error('Error assigning hero:', error);
    res.status(500).json({ success: false, error: 'Failed to assign hero' });
  }
});

// POST /api/hero/revive - Revive dead hero (costs resources)
router.post('/revive', async (req: AuthRequest, res: Response) => {
  try {
    // Get hero
    const hero = await prisma.hero.findUnique({
      where: { userId: req.userId },
    });

    if (!hero) {
      return res.status(404).json({ success: false, error: 'Hero not found' });
    }

    // Check if hero is dead
    if (hero.status !== 'dead') {
      return res.status(400).json({
        success: false,
        error: 'Hero is not dead',
      });
    }

    // Check if enough time has passed (24 hours)
    if (hero.revivedAt) {
      const timeSinceDeath = Date.now() - hero.revivedAt.getTime();
      const hoursElapsed = timeSinceDeath / (1000 * 60 * 60);

      if (hoursElapsed < REVIVE_TIME_HOURS) {
        const hoursRemaining = Math.ceil(REVIVE_TIME_HOURS - hoursElapsed);
        return res.status(400).json({
          success: false,
          error: `Hero can be revived in ${hoursRemaining} hours`,
        });
      }
    }

    // Get user's capital village for resource cost
    const capitalVillage = await prisma.village.findFirst({
      where: {
        userId: req.userId,
        isCapital: true,
      },
    });

    if (!capitalVillage) {
      return res.status(404).json({
        success: false,
        error: 'Capital village not found',
      });
    }

    // Calculate revive cost (increases with level)
    const reviveCost = {
      lumber: REVIVE_BASE_COST.lumber * hero.level,
      clay: REVIVE_BASE_COST.clay * hero.level,
      iron: REVIVE_BASE_COST.iron * hero.level,
      crop: REVIVE_BASE_COST.crop * hero.level,
    };

    // Check if enough resources
    if (
      capitalVillage.lumber < reviveCost.lumber ||
      capitalVillage.clay < reviveCost.clay ||
      capitalVillage.iron < reviveCost.iron ||
      capitalVillage.crop < reviveCost.crop
    ) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources to revive hero',
        data: {
          required: reviveCost,
          available: {
            lumber: capitalVillage.lumber,
            clay: capitalVillage.clay,
            iron: capitalVillage.iron,
            crop: capitalVillage.crop,
          },
        },
      });
    }

    // Revive hero and deduct resources
    await prisma.$transaction([
      prisma.village.update({
        where: { id: capitalVillage.id },
        data: {
          lumber: capitalVillage.lumber - reviveCost.lumber,
          clay: capitalVillage.clay - reviveCost.clay,
          iron: capitalVillage.iron - reviveCost.iron,
          crop: capitalVillage.crop - reviveCost.crop,
        },
      }),
      prisma.hero.update({
        where: { id: hero.id },
        data: {
          status: 'home',
          health: 100,
          villageId: capitalVillage.id,
          revivedAt: new Date(),
        },
      }),
    ]);

    // Fetch updated hero
    const updatedHero = await prisma.hero.findUnique({
      where: { id: hero.id },
      include: {
        items: true,
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

    res.json({
      success: true,
      data: {
        hero: {
          id: updatedHero!.id,
          name: updatedHero!.name,
          level: updatedHero!.level,
          experience: updatedHero!.experience,
          health: updatedHero!.health,
          strength: updatedHero!.strength,
          offBonus: updatedHero!.offBonus,
          defBonus: updatedHero!.defBonus,
          productionBonus: updatedHero!.productionBonus,
          status: updatedHero!.status,
          revivedAt: updatedHero!.revivedAt,
          village: updatedHero!.village ? {
            id: updatedHero!.village.id,
            name: updatedHero!.village.name,
            coordinates: {
              x: updatedHero!.village.xCoord,
              y: updatedHero!.village.yCoord,
            },
          } : null,
          items: updatedHero!.items.map((item) => ({
            id: item.id,
            type: item.type,
            name: item.name,
            bonus: JSON.parse(item.bonus),
          })),
        },
        cost: reviveCost,
      },
    });
  } catch (error) {
    console.error('Error reviving hero:', error);
    res.status(500).json({ success: false, error: 'Failed to revive hero' });
  }
});

export { router as heroRouter };
