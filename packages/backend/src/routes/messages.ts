import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const sendMessageSchema = z.object({
  recipientUsername: z.string(),
  subject: z.string().min(1).max(100),
  body: z.string().min(1).max(5000),
});

// GET /api/messages/inbox - Get received messages
router.get('/inbox', async (req: AuthRequest, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        recipientId: req.userId,
        deletedByRecipient: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            allianceMembership: {
              include: {
                alliance: {
                  select: {
                    tag: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
    });

    // Format messages with alliance tag
    const formattedMessages = messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderUsername: m.sender.username,
      senderAllianceTag: m.sender.allianceMembership?.alliance.tag || null,
      subject: m.subject,
      body: m.body,
      read: m.read,
      sentAt: m.sentAt,
    }));

    res.json({
      success: true,
      data: { messages: formattedMessages },
    });
  } catch (error) {
    console.error('Error fetching inbox:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch inbox' });
  }
});

// GET /api/messages/outbox - Get sent messages
router.get('/outbox', async (req: AuthRequest, res: Response) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        senderId: req.userId,
        deletedBySender: false,
      },
      include: {
        recipient: {
          select: {
            id: true,
            username: true,
            allianceMembership: {
              include: {
                alliance: {
                  select: {
                    tag: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
    });

    // Format messages with alliance tag
    const formattedMessages = messages.map((m) => ({
      id: m.id,
      recipientId: m.recipientId,
      recipientUsername: m.recipient.username,
      recipientAllianceTag: m.recipient.allianceMembership?.alliance.tag || null,
      subject: m.subject,
      body: m.body,
      read: m.read,
      sentAt: m.sentAt,
    }));

    res.json({
      success: true,
      data: { messages: formattedMessages },
    });
  } catch (error) {
    console.error('Error fetching outbox:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch outbox' });
  }
});

// GET /api/messages/unread/count - Get unread message count
router.get('/unread/count', async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.message.count({
      where: {
        recipientId: req.userId,
        read: false,
        deletedByRecipient: false,
      },
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

// GET /api/messages/:id - Get specific message
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            allianceMembership: {
              include: {
                alliance: {
                  select: {
                    tag: true,
                  },
                },
              },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            username: true,
            allianceMembership: {
              include: {
                alliance: {
                  select: {
                    tag: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check if user is sender or recipient
    if (message.senderId !== req.userId && message.recipientId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Check if message is deleted for this user
    if (
      (message.recipientId === req.userId && message.deletedByRecipient) ||
      (message.senderId === req.userId && message.deletedBySender)
    ) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({
      success: true,
      data: {
        message: {
          id: message.id,
          senderId: message.senderId,
          senderUsername: message.sender.username,
          senderAllianceTag: message.sender.allianceMembership?.alliance.tag || null,
          recipientId: message.recipientId,
          recipientUsername: message.recipient.username,
          recipientAllianceTag: message.recipient.allianceMembership?.alliance.tag || null,
          subject: message.subject,
          body: message.body,
          read: message.read,
          sentAt: message.sentAt,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch message' });
  }
});

// POST /api/messages - Send a new message
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { recipientUsername, subject, body } = validation.data;

    // Find recipient
    const recipient = await prisma.user.findUnique({
      where: { username: recipientUsername },
    });

    if (!recipient) {
      return res.status(404).json({
        success: false,
        error: 'Recipient not found',
      });
    }

    // Can't send message to yourself
    if (recipient.id === req.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot send message to yourself',
      });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        senderId: req.userId!,
        recipientId: recipient.id,
        subject,
        body,
      },
    });

    res.status(201).json({
      success: true,
      data: { message },
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
});

// PUT /api/messages/:id/read - Mark message as read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Find message
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Only recipient can mark as read
    if (message.recipientId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Mark as read
    await prisma.message.update({
      where: { id },
      data: { read: true },
    });

    res.json({
      success: true,
      data: { message: 'Message marked as read' },
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark message as read' });
  }
});

// DELETE /api/messages/:id - Delete a message (soft delete)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Find message
    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    // Check if user is sender or recipient
    if (message.senderId !== req.userId && message.recipientId !== req.userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    // Soft delete based on who is deleting
    if (message.senderId === req.userId) {
      await prisma.message.update({
        where: { id },
        data: { deletedBySender: true },
      });
    } else {
      await prisma.message.update({
        where: { id },
        data: { deletedByRecipient: true },
      });
    }

    // If both deleted, hard delete
    if (
      (message.deletedBySender && message.recipientId === req.userId) ||
      (message.deletedByRecipient && message.senderId === req.userId)
    ) {
      await prisma.message.delete({
        where: { id },
      });
    }

    res.json({
      success: true,
      data: { message: 'Message deleted' },
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({ success: false, error: 'Failed to delete message' });
  }
});

export { router as messagesRouter };
