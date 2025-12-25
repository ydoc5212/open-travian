import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Oasis type to image number mapping
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

// Get map tiles centered on coordinates
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

    // Fetch all villages in the coordinate range
    const villages = await prisma.village.findMany({
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
        user: {
          select: {
            username: true,
            tribe: true,
          },
        },
      },
    });

    // Create a map of coordinates to village data
    const villageMap = new Map<string, any>();
    villages.forEach((village) => {
      const key = `${village.xCoord},${village.yCoord}`;
      villageMap.set(key, {
        id: village.id,
        name: village.name,
        ownerName: village.user.username,
        ownerTribe: village.user.tribe,
        population: village.population,
        isOwn: village.userId === req.userId,
      });
    });

    // Fetch all oases in the coordinate range (optional - will be empty if table doesn't exist)
    const oasisMap = new Map<string, any>();
    try {
      const oases = await (prisma as any).oasis.findMany({
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

      oases.forEach((oasis: any) => {
        const key = `${oasis.xCoord},${oasis.yCoord}`;
        const config = OASIS_TYPE_CONFIG[oasis.type];
        oasisMap.set(key, {
          id: oasis.id,
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
        });
      });
    } catch (error) {
      // Oasis table doesn't exist or isn't accessible, skip it
      console.log('Oasis query skipped - table may not exist yet');
    }

    // Generate tile grid
    const tiles = [];
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        const key = `${tx},${ty}`;
        const village = villageMap.get(key);
        const oasis = oasisMap.get(key);

        // Determine tile type based on various factors
        let type = 'wilderness';
        let terrainVariant = 1;

        // Use coordinate hash to determine terrain variant consistently
        const hash = Math.abs((tx * 7919 + ty * 7907) % 6) + 1; // 1-6 for terrain types
        terrainVariant = Math.abs((tx * 3541 + ty * 3547) % 10) + 1; // 1-10 for variants

        if (village) {
          type = 'village';
        } else if (oasis) {
          type = 'oasis';
        }

        tiles.push({
          x: tx,
          y: ty,
          type,
          terrainVariant: `t${hash}_${terrainVariant}`,
          village: village || null,
          oasis: oasis || null,
        });
      }
    }

    res.json({
      success: true,
      data: {
        centerX: x,
        centerY: y,
        size,
        tiles,
      },
    });
  } catch (error) {
    console.error('Error fetching map:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch map' });
  }
});

export { router as mapRouter };
