import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Helper to check Gold Club status
async function checkGoldClub(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { goldClubUntil: true },
  });

  if (!user || !user.goldClubUntil) return false;

  const now = new Date();
  return user.goldClubUntil > now;
}

// Get gold balance and premium status
router.get('/status', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        gold: true,
        plusAccountUntil: true,
        goldClubUntil: true,
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const now = new Date();
    const hasPlusAccount = user.plusAccountUntil ? user.plusAccountUntil > now : false;
    const hasGoldClub = user.goldClubUntil ? user.goldClubUntil > now : false;

    res.json({
      success: true,
      data: {
        gold: user.gold,
        plusAccount: {
          active: hasPlusAccount,
          expiresAt: user.plusAccountUntil?.toISOString() || null,
        },
        goldClub: {
          active: hasGoldClub,
          expiresAt: user.goldClubUntil?.toISOString() || null,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching gold status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch gold status' });
  }
});

// Instant finish building/resource field
router.post('/instant-finish/:type/:villageId/:slot', async (req: AuthRequest, res: Response) => {
  try {
    const { type, villageId, slot } = req.params;
    const slotNum = parseInt(slot, 10);

    // Verify village ownership
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    let item;
    let targetLevel: number;
    let endsAt: Date | null;

    if (type === 'building') {
      item = await prisma.building.findUnique({
        where: { villageId_slot: { villageId, slot: slotNum } },
      });
      if (!item || !item.upgradeEndsAt) {
        return res.status(400).json({ success: false, error: 'No building construction in progress' });
      }
      endsAt = item.upgradeEndsAt;
    } else if (type === 'field') {
      item = await prisma.resourceField.findUnique({
        where: { villageId_slot: { villageId, slot: slotNum } },
      });
      if (!item || !item.upgradeEndsAt) {
        return res.status(400).json({ success: false, error: 'No field upgrade in progress' });
      }
      endsAt = item.upgradeEndsAt;
    } else {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    // Calculate remaining time in seconds
    const now = new Date();
    const remainingMs = endsAt.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return res.status(400).json({ success: false, error: 'Construction already complete' });
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);

    // Calculate gold cost: 1 gold per 5 minutes, minimum 2 gold
    const goldCost = Math.max(2, Math.ceil(remainingSeconds / 300));

    // Check if user has enough gold
    if (village.user.gold < goldCost) {
      return res.status(400).json({
        success: false,
        error: 'Not enough gold',
        data: { required: goldCost, current: village.user.gold },
      });
    }

    // Deduct gold
    await prisma.user.update({
      where: { id: req.userId },
      data: { gold: { decrement: goldCost } },
    });

    // Get the target level from the scheduled job
    const job = await prisma.gameJob.findFirst({
      where: {
        villageId,
        type: type === 'building' ? 'building_complete' : 'field_complete',
        data: { contains: `"slot":${slotNum}` },
        processed: false,
      },
    });

    if (job) {
      const jobData = JSON.parse(job.data);
      targetLevel = jobData.targetLevel;

      // Complete the construction immediately
      if (type === 'building') {
        await prisma.building.update({
          where: { villageId_slot: { villageId, slot: slotNum } },
          data: {
            level: targetLevel,
            upgradeStartedAt: null,
            upgradeEndsAt: null,
          },
        });
      } else {
        await prisma.resourceField.update({
          where: { villageId_slot: { villageId, slot: slotNum } },
          data: {
            level: targetLevel,
            upgradeStartedAt: null,
            upgradeEndsAt: null,
          },
        });
      }

      // Mark the job as processed
      await prisma.gameJob.update({
        where: { id: job.id },
        data: { processed: true },
      });

      // Start next queued item if any
      const { startNextQueueItem } = await import('../services/queue');
      await startNextQueueItem(villageId);

      res.json({
        success: true,
        data: {
          goldSpent: goldCost,
          remainingGold: village.user.gold - goldCost,
          completedLevel: targetLevel,
        },
      });
    } else {
      return res.status(500).json({ success: false, error: 'Job not found' });
    }
  } catch (error) {
    console.error('Error instant finishing:', error);
    res.status(500).json({ success: false, error: 'Failed to instant finish' });
  }
});

// Instant finish troop training
router.post('/instant-finish/troops/:villageId', async (req: AuthRequest, res: Response) => {
  try {
    const { villageId } = req.params;

    // Verify village ownership
    const village = await prisma.village.findFirst({
      where: { id: villageId, userId: req.userId },
      include: { user: true },
    });

    if (!village) {
      return res.status(404).json({ success: false, error: 'Village not found' });
    }

    // Find the next training job
    const job = await prisma.gameJob.findFirst({
      where: {
        villageId,
        type: 'troop_training',
        processed: false,
      },
      orderBy: { scheduledFor: 'asc' },
    });

    if (!job) {
      return res.status(400).json({ success: false, error: 'No troop training in progress' });
    }

    // Calculate remaining time
    const now = new Date();
    const remainingMs = job.scheduledFor.getTime() - now.getTime();

    if (remainingMs <= 0) {
      return res.status(400).json({ success: false, error: 'Training already complete' });
    }

    const remainingSeconds = Math.ceil(remainingMs / 1000);

    // Calculate gold cost
    const goldCost = Math.max(2, Math.ceil(remainingSeconds / 300));

    // Check if user has enough gold
    if (village.user.gold < goldCost) {
      return res.status(400).json({
        success: false,
        error: 'Not enough gold',
        data: { required: goldCost, current: village.user.gold },
      });
    }

    // Deduct gold
    await prisma.user.update({
      where: { id: req.userId },
      data: { gold: { decrement: goldCost } },
    });

    // Complete training immediately
    const jobData = JSON.parse(job.data);
    const { unitType, quantity } = jobData;

    // Add troops to village
    const existingTroop = await prisma.troop.findFirst({
      where: { villageId, unitType, status: 'home' },
    });

    if (existingTroop) {
      await prisma.troop.update({
        where: { id: existingTroop.id },
        data: { quantity: { increment: quantity } },
      });
    } else {
      await prisma.troop.create({
        data: {
          villageId,
          unitType,
          quantity,
          status: 'home',
        },
      });
    }

    // Mark job as processed
    await prisma.gameJob.update({
      where: { id: job.id },
      data: { processed: true },
    });

    res.json({
      success: true,
      data: {
        goldSpent: goldCost,
        remainingGold: village.user.gold - goldCost,
        unitType,
        quantity,
      },
    });
  } catch (error) {
    console.error('Error instant finishing troops:', error);
    res.status(500).json({ success: false, error: 'Failed to instant finish troops' });
  }
});

// Purchase resource bonus (25% for 5 days)
router.post('/buy-resource-bonus/:resourceType', async (req: AuthRequest, res: Response) => {
  try {
    const { resourceType } = req.params;

    // Validate resource type
    if (!['lumber', 'clay', 'iron', 'crop'].includes(resourceType)) {
      return res.status(400).json({ success: false, error: 'Invalid resource type' });
    }

    // Get user
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const GOLD_COST = 5; // 5 gold for 25% bonus for 5 days

    if (user.gold < GOLD_COST) {
      return res.status(400).json({
        success: false,
        error: 'Not enough gold',
        data: { required: GOLD_COST, current: user.gold },
      });
    }

    // Check if user already has an active bonus for this resource
    const now = new Date();
    const existingBonus = await prisma.resourceBonus.findFirst({
      where: {
        userId: req.userId,
        resourceType,
        expiresAt: { gt: now },
      },
    });

    if (existingBonus) {
      return res.status(400).json({
        success: false,
        error: 'You already have an active bonus for this resource',
      });
    }

    // Deduct gold and create bonus
    const expiresAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.userId },
        data: { gold: { decrement: GOLD_COST } },
      }),
      prisma.resourceBonus.create({
        data: {
          userId: req.userId!,
          resourceType,
          bonusPercent: 25,
          expiresAt,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        resourceType,
        bonusPercent: 25,
        expiresAt: expiresAt.toISOString(),
        goldSpent: GOLD_COST,
        remainingGold: user.gold - GOLD_COST,
      },
    });
  } catch (error) {
    console.error('Error buying resource bonus:', error);
    res.status(500).json({ success: false, error: 'Failed to buy resource bonus' });
  }
});

// Activate Gold Club (30 days)
router.post('/activate-gold-club', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const GOLD_COST = 100; // 100 gold for 30 days of Gold Club

    if (user.gold < GOLD_COST) {
      return res.status(400).json({
        success: false,
        error: 'Not enough gold',
        data: { required: GOLD_COST, current: user.gold },
      });
    }

    // Calculate expiration (extend if already active)
    const now = new Date();
    const currentExpiry = user.goldClubUntil && user.goldClubUntil > now ? user.goldClubUntil : now;
    const newExpiry = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: req.userId },
      data: {
        gold: { decrement: GOLD_COST },
        goldClubUntil: newExpiry,
      },
    });

    res.json({
      success: true,
      data: {
        goldSpent: GOLD_COST,
        remainingGold: user.gold - GOLD_COST,
        expiresAt: newExpiry.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error activating Gold Club:', error);
    res.status(500).json({ success: false, error: 'Failed to activate Gold Club' });
  }
});

// Get active resource bonuses
router.get('/resource-bonuses', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const bonuses = await prisma.resourceBonus.findMany({
      where: {
        userId: req.userId,
        expiresAt: { gt: now },
      },
    });

    res.json({
      success: true,
      data: bonuses.map((b) => ({
        id: b.id,
        resourceType: b.resourceType,
        bonusPercent: b.bonusPercent,
        activatedAt: b.activatedAt.toISOString(),
        expiresAt: b.expiresAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching resource bonuses:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch resource bonuses' });
  }
});

export { router as goldRouter, checkGoldClub };
