import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/world-wonders - List all world wonders with rankings
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const worldWonders = await prisma.worldWonder.findMany({
      include: {
        ownerAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
            members: {
              select: {
                userId: true,
                user: {
                  select: {
                    username: true,
                  },
                },
              },
            },
          },
        },
        buildLogs: {
          orderBy: {
            completedAt: 'desc',
          },
          take: 5,
        },
      },
      orderBy: {
        level: 'desc',
      },
    });

    const wwData = worldWonders.map((ww, index) => ({
      id: ww.id,
      coordinates: { x: ww.xCoord, y: ww.yCoord },
      level: ww.level,
      rank: index + 1,
      ownerAlliance: ww.ownerAlliance
        ? {
            allianceId: ww.ownerAlliance.id,
            name: ww.ownerAlliance.name,
            tag: ww.ownerAlliance.tag,
            memberCount: ww.ownerAlliance.members.length,
          }
        : null,
      capturedAt: ww.capturedAt,
      createdAt: ww.createdAt,
      recentBuilds: ww.buildLogs.slice(0, 5),
    }));

    // Check server state
    const serverState = await prisma.serverState.findFirst();

    res.json({
      success: true,
      data: {
        worldWonders: wwData,
        serverPhase: serverState?.phase || 'normal',
        gameStartedAt: serverState?.gameStartedAt,
        artefactsSpawnedAt: serverState?.artefactsSpawnedAt,
        winnerAllianceId: serverState?.winnerAllianceId,
      },
    });
  } catch (error) {
    console.error('Error fetching world wonders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch world wonders' });
  }
});

// GET /api/world-wonders/:id - Get specific world wonder details
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const worldWonder = await prisma.worldWonder.findUnique({
      where: { id },
      include: {
        ownerAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
            founderId: true,
            members: {
              select: {
                userId: true,
                user: {
                  select: {
                    username: true,
                    villages: {
                      select: {
                        population: true,
                      },
                    },
                  },
                },
                role: true,
              },
            },
          },
        },
        buildLogs: {
          orderBy: {
            completedAt: 'desc',
          },
          take: 20,
        },
      },
    });

    if (!worldWonder) {
      return res.status(404).json({ success: false, error: 'World wonder not found' });
    }

    // Calculate next level requirements
    const nextLevel = worldWonder.level + 1;
    const baseTime = 10000; // 10 seconds base
    const timeFactor = Math.pow(1.2, nextLevel);
    const nextLevelTime = Math.floor(baseTime * timeFactor);

    const baseCost = {
      lumber: 5000,
      clay: 5000,
      iron: 5000,
      crop: 5000,
    };
    const costFactor = Math.pow(1.5, nextLevel);
    const nextLevelCost = {
      lumber: Math.floor(baseCost.lumber * costFactor),
      clay: Math.floor(baseCost.clay * costFactor),
      iron: Math.floor(baseCost.iron * costFactor),
      crop: Math.floor(baseCost.crop * costFactor),
    };

    res.json({
      success: true,
      data: {
        id: worldWonder.id,
        coordinates: { x: worldWonder.xCoord, y: worldWonder.yCoord },
        level: worldWonder.level,
        ownerAlliance: worldWonder.ownerAlliance
          ? {
              allianceId: worldWonder.ownerAlliance.id,
              name: worldWonder.ownerAlliance.name,
              tag: worldWonder.ownerAlliance.tag,
              memberCount: worldWonder.ownerAlliance.members.length,
              members: worldWonder.ownerAlliance.members.map((m) => ({
                username: m.user.username,
                role: m.role,
                population: m.user.villages.reduce((sum, v) => sum + v.population, 0),
              })),
            }
          : null,
        capturedAt: worldWonder.capturedAt,
        createdAt: worldWonder.createdAt,
        buildHistory: worldWonder.buildLogs,
        nextLevel: nextLevel <= 100 ? {
          level: nextLevel,
          cost: nextLevelCost,
          time: nextLevelTime,
        } : null,
        isComplete: worldWonder.level >= 100,
      },
    });
  } catch (error) {
    console.error('Error fetching world wonder:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch world wonder' });
  }
});

// GET /api/world-wonders/alliance/:allianceId - Get world wonders owned by alliance
router.get('/alliance/:allianceId', async (req: AuthRequest, res: Response) => {
  try {
    const { allianceId } = req.params;

    const worldWonders = await prisma.worldWonder.findMany({
      where: { ownerAllianceId: allianceId },
      include: {
        buildLogs: {
          orderBy: {
            completedAt: 'desc',
          },
          take: 10,
        },
      },
      orderBy: {
        level: 'desc',
      },
    });

    const wwData = worldWonders.map((ww) => ({
      id: ww.id,
      coordinates: { x: ww.xCoord, y: ww.yCoord },
      level: ww.level,
      capturedAt: ww.capturedAt,
      createdAt: ww.createdAt,
      recentBuilds: ww.buildLogs.slice(0, 10),
    }));

    res.json({
      success: true,
      data: {
        worldWonders: wwData,
      },
    });
  } catch (error) {
    console.error('Error fetching alliance world wonders:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alliance world wonders' });
  }
});

// POST /api/world-wonders/:id/upgrade - Contribute to World Wonder upgrade
router.post('/:id/upgrade', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { villageId } = req.body;

    // Get user's alliance
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      include: {
        allianceMembership: {
          include: {
            alliance: true,
          },
        },
      },
    });

    if (!user?.allianceMembership) {
      return res.status(400).json({ success: false, error: 'You must be in an alliance to contribute' });
    }

    // Get the world wonder
    const worldWonder = await prisma.worldWonder.findUnique({
      where: { id },
    });

    if (!worldWonder) {
      return res.status(404).json({ success: false, error: 'World wonder not found' });
    }

    if (worldWonder.ownerAllianceId !== user.allianceMembership.allianceId) {
      return res.status(403).json({ success: false, error: 'Your alliance does not own this world wonder' });
    }

    if (worldWonder.level >= 100) {
      return res.status(400).json({ success: false, error: 'World wonder is already complete' });
    }

    // Get contributor village
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Calculate costs
    const nextLevel = worldWonder.level + 1;
    const costFactor = Math.pow(1.5, nextLevel);
    const cost = {
      lumber: Math.floor(5000 * costFactor),
      clay: Math.floor(5000 * costFactor),
      iron: Math.floor(5000 * costFactor),
      crop: Math.floor(5000 * costFactor),
    };

    // Check resources
    if (
      village.lumber < cost.lumber ||
      village.clay < cost.clay ||
      village.iron < cost.iron ||
      village.crop < cost.crop
    ) {
      return res.status(400).json({
        success: false,
        error: 'Not enough resources',
        data: {
          required: cost,
          available: {
            lumber: Math.floor(village.lumber),
            clay: Math.floor(village.clay),
            iron: Math.floor(village.iron),
            crop: Math.floor(village.crop),
          },
        },
      });
    }

    // Update world wonder level and deduct resources
    await prisma.$transaction(async (tx) => {
      // Deduct resources
      await tx.village.update({
        where: { id: villageId },
        data: {
          lumber: village.lumber - cost.lumber,
          clay: village.clay - cost.clay,
          iron: village.iron - cost.iron,
          crop: village.crop - cost.crop,
        },
      });

      // Upgrade world wonder
      await tx.worldWonder.update({
        where: { id },
        data: {
          level: nextLevel,
        },
      });

      // Log the build
      await tx.worldWonderLog.create({
        data: {
          worldWonderId: id,
          fromLevel: worldWonder.level,
          toLevel: nextLevel,
          allianceId: user.allianceMembership!.allianceId,
        },
      });

      // Check for victory (level 100)
      if (nextLevel >= 100) {
        await tx.serverState.updateMany({
          data: {
            phase: 'ended',
            gameEndedAt: new Date(),
            winnerAllianceId: user.allianceMembership!.allianceId,
          },
        });

        console.log(`🏆 GAME OVER! Alliance ${user.allianceMembership!.alliance.name} wins!`);
      }
    });

    res.json({
      success: true,
      data: {
        newLevel: nextLevel,
        isVictory: nextLevel >= 100,
        cost,
      },
    });
  } catch (error) {
    console.error('Error upgrading world wonder:', error);
    res.status(500).json({ success: false, error: 'Failed to upgrade world wonder' });
  }
});

// GET /api/world-wonders/server/state - Get server state
router.get('/server/state', async (req: AuthRequest, res: Response) => {
  try {
    let serverState = await prisma.serverState.findFirst();

    if (!serverState) {
      // Create default server state
      serverState = await prisma.serverState.create({
        data: {
          phase: 'normal',
          gameStartedAt: new Date(),
        },
      });
    }

    let winnerAlliance = null;
    if (serverState.winnerAllianceId) {
      winnerAlliance = await prisma.alliance.findUnique({
        where: { id: serverState.winnerAllianceId },
        select: { id: true, name: true, tag: true },
      });
    }

    res.json({
      success: true,
      data: {
        phase: serverState.phase,
        gameStartedAt: serverState.gameStartedAt,
        artefactsSpawnedAt: serverState.artefactsSpawnedAt,
        gameEndedAt: serverState.gameEndedAt,
        winner: winnerAlliance,
      },
    });
  } catch (error) {
    console.error('Error fetching server state:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch server state' });
  }
});

export { router as worldWondersRouter };
