import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get Plus account status
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { plusAccountUntil: true },
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const now = new Date();
    const isActive = user.plusAccountUntil ? user.plusAccountUntil > now : false;

    res.json({
      success: true,
      data: {
        isActive,
        expiresAt: user.plusAccountUntil?.toISOString() || null,
      },
    });
  } catch (error) {
    console.error('Error fetching Plus status:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch Plus status' });
  }
});

// Activate Plus account (for testing - grants 30 days)
router.post('/activate', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.user.update({
      where: { id: req.userId },
      data: { plusAccountUntil: expiresAt },
    });

    res.json({
      success: true,
      data: {
        isActive: true,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error activating Plus:', error);
    res.status(500).json({ success: false, error: 'Failed to activate Plus' });
  }
});

export { router as plusRouter };
