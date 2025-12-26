import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Artefact effect descriptions
const ARTEFACT_EFFECTS: Record<string, { name: string; description: string }> = {
  attack_bonus: { name: 'Great Sword', description: 'Increases offensive power of all troops' },
  defense_bonus: { name: 'Great Shield', description: 'Increases defensive power of all troops' },
  training_speed: { name: 'Trainer', description: 'Reduces training time for troops' },
  building_speed: { name: 'Architect', description: 'Reduces building upgrade time' },
  cranny_size: { name: 'Great Cranny', description: 'Massively increases cranny capacity' },
  troop_speed: { name: 'Boots of the Mercenary', description: 'Increases troop movement speed' },
  spy_defense: { name: 'Eye of the Spy', description: 'Improves scout defense and detection' },
  resource_production: { name: 'Cornucopia', description: 'Increases resource production' },
  world_wonder_plans: { name: 'WW Construction Plans', description: 'Required to build World Wonder beyond level 50' },
};

// GET /api/artefacts - List all artefacts
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const artefacts = await prisma.artefact.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            xCoord: true,
            yCoord: true,
            user: {
              select: {
                username: true,
              },
            },
          },
        },
        ownerAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    const artefactData = artefacts.map((art) => {
      const effectInfo = ARTEFACT_EFFECTS[art.effect] || { name: 'Unknown', description: 'Unknown effect' };
      const isActive = art.activatedAt && new Date(art.activatedAt) <= new Date();

      return {
        id: art.id,
        type: art.type,
        effect: art.effect,
        effectName: effectInfo.name,
        effectDescription: effectInfo.description,
        size: art.size,
        coordinates: { x: art.xCoord, y: art.yCoord },
        owner: art.owner
          ? {
              villageId: art.owner.id,
              villageName: art.owner.name,
              coordinates: { x: art.owner.xCoord, y: art.owner.yCoord },
              ownerName: art.owner.user.username,
            }
          : null,
        ownerAlliance: art.ownerAlliance
          ? {
              allianceId: art.ownerAlliance.id,
              name: art.ownerAlliance.name,
              tag: art.ownerAlliance.tag,
            }
          : null,
        capturedAt: art.capturedAt,
        activatedAt: art.activatedAt,
        isActive,
        spawnedAt: art.spawnedAt,
      };
    });

    res.json({
      success: true,
      data: {
        artefacts: artefactData,
      },
    });
  } catch (error) {
    console.error('Error fetching artefacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch artefacts' });
  }
});

// GET /api/artefacts/:id - Get specific artefact details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const artefact = await prisma.artefact.findUnique({
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
        ownerAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
            members: {
              select: {
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!artefact) {
      return res.status(404).json({ success: false, error: 'Artefact not found' });
    }

    const effectInfo = ARTEFACT_EFFECTS[artefact.effect] || { name: 'Unknown', description: 'Unknown effect' };
    const isActive = artefact.activatedAt && new Date(artefact.activatedAt) <= new Date();
    const isOwn = artefact.owner?.userId === req.userId;

    // Calculate activation countdown if captured but not yet active
    let activatesIn: number | null = null;
    if (artefact.capturedAt && artefact.activatedAt) {
      const now = new Date();
      const activationTime = new Date(artefact.activatedAt);
      if (activationTime > now) {
        activatesIn = Math.floor((activationTime.getTime() - now.getTime()) / 1000);
      }
    }

    res.json({
      success: true,
      data: {
        id: artefact.id,
        type: artefact.type,
        effect: artefact.effect,
        effectName: effectInfo.name,
        effectDescription: effectInfo.description,
        size: artefact.size,
        coordinates: { x: artefact.xCoord, y: artefact.yCoord },
        owner: artefact.owner
          ? {
              villageId: artefact.owner.id,
              villageName: artefact.owner.name,
              coordinates: { x: artefact.owner.xCoord, y: artefact.owner.yCoord },
              ownerName: artefact.owner.user.username,
              ownerTribe: artefact.owner.user.tribe,
              isOwn,
            }
          : null,
        ownerAlliance: artefact.ownerAlliance
          ? {
              allianceId: artefact.ownerAlliance.id,
              name: artefact.ownerAlliance.name,
              tag: artefact.ownerAlliance.tag,
            }
          : null,
        capturedAt: artefact.capturedAt,
        activatedAt: artefact.activatedAt,
        isActive,
        activatesIn,
        spawnedAt: artefact.spawnedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching artefact:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch artefact' });
  }
});

// GET /api/artefacts/alliance/:allianceId - Get artefacts owned by alliance
router.get('/alliance/:allianceId', async (req: AuthRequest, res: Response) => {
  try {
    const { allianceId } = req.params;

    const artefacts = await prisma.artefact.findMany({
      where: { ownerAllianceId: allianceId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            xCoord: true,
            yCoord: true,
            user: {
              select: {
                username: true,
              },
            },
          },
        },
      },
      orderBy: [
        { type: 'desc' }, // unique, large, small
        { effect: 'asc' },
      ],
    });

    const artefactData = artefacts.map((art) => {
      const effectInfo = ARTEFACT_EFFECTS[art.effect] || { name: 'Unknown', description: 'Unknown effect' };
      const isActive = art.activatedAt && new Date(art.activatedAt) <= new Date();

      return {
        id: art.id,
        type: art.type,
        effect: art.effect,
        effectName: effectInfo.name,
        effectDescription: effectInfo.description,
        size: art.size,
        coordinates: { x: art.xCoord, y: art.yCoord },
        owner: art.owner
          ? {
              villageId: art.owner.id,
              villageName: art.owner.name,
              coordinates: { x: art.owner.xCoord, y: art.owner.yCoord },
              ownerName: art.owner.user.username,
            }
          : null,
        capturedAt: art.capturedAt,
        activatedAt: art.activatedAt,
        isActive,
      };
    });

    res.json({
      success: true,
      data: {
        artefacts: artefactData,
      },
    });
  } catch (error) {
    console.error('Error fetching alliance artefacts:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alliance artefacts' });
  }
});

export { router as artefactsRouter };
