import { Router, Response } from 'express';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Get all reports for user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const reports = await prisma.report.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const formattedReports = reports.map((report) => ({
      id: report.id,
      type: report.type,
      data: JSON.parse(report.data),
      read: report.read,
      createdAt: report.createdAt,
    }));

    res.json({
      success: true,
      data: { reports: formattedReports },
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// Get single report
router.get('/:reportId', async (req: AuthRequest, res: Response) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: req.userId },
    });

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    res.json({
      success: true,
      data: {
        report: {
          id: report.id,
          type: report.type,
          data: JSON.parse(report.data),
          read: report.read,
          createdAt: report.createdAt,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
});

// Mark report as read
router.put('/:reportId/read', async (req: AuthRequest, res: Response) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: req.userId },
    });

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    await prisma.report.update({
      where: { id: reportId },
      data: { read: true },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking report as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark report as read' });
  }
});

// Delete report
router.delete('/:reportId', async (req: AuthRequest, res: Response) => {
  try {
    const { reportId } = req.params;

    const report = await prisma.report.findFirst({
      where: { id: reportId, userId: req.userId },
    });

    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }

    await prisma.report.delete({
      where: { id: reportId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ success: false, error: 'Failed to delete report' });
  }
});

// Get unread count
router.get('/unread/count', async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.report.count({
      where: { userId: req.userId, read: false },
    });

    res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch unread count' });
  }
});

export { router as reportsRouter };
