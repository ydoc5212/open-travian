import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Oasis type to resource mapping and bonus percentages
const OASIS_TYPE_CONFIG: Record<string, { resource: string; bonus: number; imageNumber: number }> = {
  lumber25: { resource: 'lumber', bonus: 25, imageNumber: 1 },
  lumber50: { resource: 'lumber', bonus: 50, imageNumber: 2 },
  clay25: { resource: 'clay', bonus: 25, imageNumber: 3 },
  clay50: { resource: 'clay', bonus: 50, imageNumber: 4 },
  iron25: { resource: 'iron', bonus: 25, imageNumber: 5 },
  iron50: { resource: 'iron', bonus: 50, imageNumber: 6 },
  crop25: { resource: 'crop', bonus: 25, imageNumber: 7 },
  crop50: { resource: 'crop', bonus: 50, imageNumber: 8 },
};

// Get oases in a map area
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const x = parseInt(req.query.x as string) || 0;
    const y = parseInt(req.query.y as string) || 0;
    const size = parseInt(req.query.size as string) || 7;

    // Calculate bounds
    const minX = x - size;
    const maxX = x + size;
    const minY = y - size;
    const maxY = y + size;

    // Fetch all oases in the coordinate range
    const oases = await prisma.oasis.findMany({
      where: {
        xCoord: {
          gte: minX,
          lte: maxX,
        },
        yCoord: {
          gte: minY,
          lte: maxY,
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            userId: true,
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    const oasisData = oases.map((oasis) => {
      const config = OASIS_TYPE_CONFIG[oasis.type];
      return {
        id: oasis.id,
        x: oasis.xCoord,
        y: oasis.yCoord,
        type: oasis.type,
        resourceType: config?.resource || 'unknown',
        bonus: config?.bonus || 0,
        imageNumber: config?.imageNumber || 1,
        owner: oasis.owner
          ? {
              villageId: oasis.owner.id,
              villageName: oasis.owner.name,
              ownerName: oasis.owner.user.username,
              isOwn: oasis.owner.userId === req.userId,
            }
          : null,
        conqueredAt: oasis.conqueredAt,
      };
    });

    res.json({
      success: true,
      data: {
        centerX: x,
        centerY: y,
        size,
        oases: oasisData,
      },
    });
  } catch (error) {
    console.error('Error fetching oases:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch oases' });
  }
});

// Get single oasis details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const oasis = await prisma.oasis.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            xCoord: true,
            yCoord: true,
            userId: true,
            user: {
              select: {
                username: true,
                tribe: true,
              },
            },
          },
        },
      },
    });

    if (!oasis) {
      return res.status(404).json({ success: false, error: 'Oasis not found' });
    }

    const config = OASIS_TYPE_CONFIG[oasis.type];

    // Generate defending wild animals based on oasis type and coordinates
    // Using coordinate hash for consistent but varied animal counts
    const hash = Math.abs((oasis.xCoord * 7919 + oasis.yCoord * 7907) % 100);
    const animalTypes = ['rats', 'spiders', 'snakes', 'bats', 'wild_boars', 'wolves', 'bears', 'crocodiles'];

    // Higher bonus oases have stronger defenders
    const baseDefenders = config?.bonus === 50 ? 20 : 10;
    const defenders = animalTypes.slice(0, 3 + (hash % 3)).map((animal, index) => ({
      type: animal,
      quantity: Math.floor(baseDefenders * (1 + (hash % (index + 1)) / 10)),
    }));

    res.json({
      success: true,
      data: {
        id: oasis.id,
        coordinates: { x: oasis.xCoord, y: oasis.yCoord },
        type: oasis.type,
        resourceType: config?.resource || 'unknown',
        bonus: config?.bonus || 0,
        imageNumber: config?.imageNumber || 1,
        owner: oasis.owner
          ? {
              villageId: oasis.owner.id,
              villageName: oasis.owner.name,
              coordinates: { x: oasis.owner.xCoord, y: oasis.owner.yCoord },
              ownerName: oasis.owner.user.username,
              ownerTribe: oasis.owner.user.tribe,
              isOwn: oasis.owner.userId === req.userId,
            }
          : null,
        conqueredAt: oasis.conqueredAt,
        defenders,
      },
    });
  } catch (error) {
    console.error('Error fetching oasis:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch oasis' });
  }
});

export { router as oasisRouter };
