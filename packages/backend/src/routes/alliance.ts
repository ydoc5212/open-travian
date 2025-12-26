import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../index';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// Validation schemas
const createAllianceSchema = z.object({
  name: z.string().min(3).max(30),
  tag: z.string().min(2).max(8),
});

const invitePlayerSchema = z.object({
  username: z.string(),
});

const changeRoleSchema = z.object({
  role: z.enum(['member', 'officer', 'leader']),
});

const allianceMessageSchema = z.object({
  subject: z.string().min(1).max(100),
  body: z.string().min(1).max(5000),
});

const diplomacySchema = z.object({
  targetAllianceId: z.string(),
  relationType: z.enum(['nap', 'confederation', 'war']),
});

// GET /api/alliance - Get current user's alliance info
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
      include: {
        alliance: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    tribe: true,
                    villages: {
                      select: {
                        population: true,
                      },
                    },
                  },
                },
              },
              orderBy: [
                { role: 'asc' }, // founder first, then leaders, officers, members
                { joinedAt: 'asc' },
              ],
            },
          },
        },
      },
    });

    if (!membership) {
      return res.json({
        success: true,
        data: { alliance: null },
      });
    }

    // Calculate total population for each member
    const members = membership.alliance.members.map((m) => {
      const totalPopulation = m.user.villages.reduce((sum, v) => sum + v.population, 0);
      return {
        id: m.id,
        userId: m.userId,
        username: m.user.username,
        tribe: m.user.tribe,
        role: m.role,
        joinedAt: m.joinedAt,
        population: totalPopulation,
      };
    });

    res.json({
      success: true,
      data: {
        alliance: {
          id: membership.alliance.id,
          name: membership.alliance.name,
          tag: membership.alliance.tag,
          founderId: membership.alliance.founderId,
          createdAt: membership.alliance.createdAt,
          members,
          myRole: membership.role,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching alliance:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alliance' });
  }
});

// GET /api/alliance/:id - Get alliance details (public info)
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const alliance = await prisma.alliance.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                tribe: true,
                villages: {
                  select: {
                    population: true,
                  },
                },
              },
            },
          },
          orderBy: [
            { role: 'asc' },
            { joinedAt: 'asc' },
          ],
        },
      },
    });

    if (!alliance) {
      return res.status(404).json({ success: false, error: 'Alliance not found' });
    }

    // Calculate total population for each member
    const members = alliance.members.map((m) => {
      const totalPopulation = m.user.villages.reduce((sum, v) => sum + v.population, 0);
      return {
        userId: m.userId,
        username: m.user.username,
        tribe: m.user.tribe,
        role: m.role,
        joinedAt: m.joinedAt,
        population: totalPopulation,
      };
    });

    const totalPopulation = members.reduce((sum, m) => sum + m.population, 0);

    res.json({
      success: true,
      data: {
        alliance: {
          id: alliance.id,
          name: alliance.name,
          tag: alliance.tag,
          createdAt: alliance.createdAt,
          memberCount: members.length,
          totalPopulation,
          members,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching alliance:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alliance' });
  }
});

// POST /api/alliance - Create new alliance
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const validation = createAllianceSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { name, tag } = validation.data;

    // Check if user is already in an alliance
    const existingMembership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        error: 'You are already in an alliance',
      });
    }

    // Check if alliance name or tag already exists
    const existingAlliance = await prisma.alliance.findFirst({
      where: {
        OR: [
          { name },
          { tag },
        ],
      },
    });

    if (existingAlliance) {
      return res.status(400).json({
        success: false,
        error: existingAlliance.name === name
          ? 'Alliance name already taken'
          : 'Alliance tag already taken',
      });
    }

    // Create alliance and add founder as member
    const alliance = await prisma.$transaction(async (tx) => {
      const newAlliance = await tx.alliance.create({
        data: {
          name,
          tag,
          founderId: req.userId!,
        },
      });

      await tx.allianceMember.create({
        data: {
          allianceId: newAlliance.id,
          userId: req.userId!,
          role: 'founder',
        },
      });

      return newAlliance;
    });

    res.status(201).json({
      success: true,
      data: { alliance },
    });
  } catch (error) {
    console.error('Error creating alliance:', error);
    res.status(500).json({ success: false, error: 'Failed to create alliance' });
  }
});

// POST /api/alliance/invite/:username - Invite a player
router.post('/invite/:username', async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.params;

    // Get current user's alliance and role
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
      include: { alliance: true },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only leaders and officers can invite
    if (membership.role !== 'founder' && membership.role !== 'leader' && membership.role !== 'officer') {
      return res.status(403).json({
        success: false,
        error: 'Only leaders and officers can invite players',
      });
    }

    // Find the target user
    const targetUser = await prisma.user.findUnique({
      where: { username },
      include: { allianceMembership: true },
    });

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: 'Player not found',
      });
    }

    if (targetUser.allianceMembership) {
      return res.status(400).json({
        success: false,
        error: 'Player is already in an alliance',
      });
    }

    // In a real implementation, you would create an invitation record
    // For simplicity, we'll just return success
    // TODO: Implement invitation system with Message model

    res.json({
      success: true,
      data: { message: `Invitation sent to ${username}` },
    });
  } catch (error) {
    console.error('Error inviting player:', error);
    res.status(500).json({ success: false, error: 'Failed to invite player' });
  }
});

// POST /api/alliance/join/:allianceId - Accept invitation / request to join
router.post('/join/:allianceId', async (req: AuthRequest, res: Response) => {
  try {
    const { allianceId } = req.params;

    // Check if user is already in an alliance
    const existingMembership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (existingMembership) {
      return res.status(400).json({
        success: false,
        error: 'You are already in an alliance',
      });
    }

    // Check if alliance exists
    const alliance = await prisma.alliance.findUnique({
      where: { id: allianceId },
    });

    if (!alliance) {
      return res.status(404).json({
        success: false,
        error: 'Alliance not found',
      });
    }

    // Add user to alliance as member
    await prisma.allianceMember.create({
      data: {
        allianceId,
        userId: req.userId!,
        role: 'member',
      },
    });

    res.json({
      success: true,
      data: { message: 'Successfully joined alliance' },
    });
  } catch (error) {
    console.error('Error joining alliance:', error);
    res.status(500).json({ success: false, error: 'Failed to join alliance' });
  }
});

// POST /api/alliance/leave - Leave current alliance
router.post('/leave', async (req: AuthRequest, res: Response) => {
  try {
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
      include: {
        alliance: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Founder cannot leave unless they're the only member
    if (membership.role === 'founder') {
      if (membership.alliance.members.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'Founder must transfer leadership or disband alliance before leaving',
        });
      }

      // Founder is the only member, delete alliance
      await prisma.$transaction([
        prisma.allianceMember.delete({ where: { id: membership.id } }),
        prisma.alliance.delete({ where: { id: membership.allianceId } }),
      ]);

      return res.json({
        success: true,
        data: { message: 'Alliance disbanded' },
      });
    }

    // Regular member or officer can leave
    await prisma.allianceMember.delete({
      where: { id: membership.id },
    });

    res.json({
      success: true,
      data: { message: 'Successfully left alliance' },
    });
  } catch (error) {
    console.error('Error leaving alliance:', error);
    res.status(500).json({ success: false, error: 'Failed to leave alliance' });
  }
});

// DELETE /api/alliance/kick/:userId - Kick a member
router.delete('/kick/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Get current user's alliance and role
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founder and leaders can kick
    if (membership.role !== 'founder' && membership.role !== 'leader') {
      return res.status(403).json({
        success: false,
        error: 'Only founders and leaders can kick members',
      });
    }

    // Find target member
    const targetMember = await prisma.allianceMember.findFirst({
      where: {
        userId,
        allianceId: membership.allianceId,
      },
    });

    if (!targetMember) {
      return res.status(404).json({
        success: false,
        error: 'Member not found in your alliance',
      });
    }

    // Cannot kick the founder
    if (targetMember.role === 'founder') {
      return res.status(403).json({
        success: false,
        error: 'Cannot kick the founder',
      });
    }

    // Leaders cannot kick other leaders
    if (membership.role === 'leader' && targetMember.role === 'leader') {
      return res.status(403).json({
        success: false,
        error: 'Leaders cannot kick other leaders',
      });
    }

    // Cannot kick yourself
    if (targetMember.userId === req.userId) {
      return res.status(400).json({
        success: false,
        error: 'Use /leave to leave the alliance',
      });
    }

    await prisma.allianceMember.delete({
      where: { id: targetMember.id },
    });

    res.json({
      success: true,
      data: { message: 'Member kicked from alliance' },
    });
  } catch (error) {
    console.error('Error kicking member:', error);
    res.status(500).json({ success: false, error: 'Failed to kick member' });
  }
});

// PUT /api/alliance/role/:userId - Change member role (leader only)
router.put('/role/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    const validation = changeRoleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { role } = validation.data;

    // Get current user's alliance and role
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founder can change roles
    if (membership.role !== 'founder') {
      return res.status(403).json({
        success: false,
        error: 'Only the founder can change member roles',
      });
    }

    // Find target member
    const targetMember = await prisma.allianceMember.findFirst({
      where: {
        userId,
        allianceId: membership.allianceId,
      },
    });

    if (!targetMember) {
      return res.status(404).json({
        success: false,
        error: 'Member not found in your alliance',
      });
    }

    // Cannot change founder's role
    if (targetMember.role === 'founder') {
      return res.status(403).json({
        success: false,
        error: 'Cannot change founder role',
      });
    }

    // Cannot change own role
    if (targetMember.userId === req.userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own role',
      });
    }

    // Update role
    await prisma.allianceMember.update({
      where: { id: targetMember.id },
      data: { role },
    });

    res.json({
      success: true,
      data: { message: `Member role updated to ${role}` },
    });
  } catch (error) {
    console.error('Error changing role:', error);
    res.status(500).json({ success: false, error: 'Failed to change role' });
  }
});

// ============================================
// ALLIANCE MESSAGING (Circular Messages)
// ============================================

// GET /api/alliance/messages - Get alliance circular messages
router.get('/messages', async (req: AuthRequest, res: Response) => {
  try {
    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Get alliance messages
    const messages = await prisma.allianceMessage.findMany({
      where: {
        allianceId: membership.allianceId,
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 50, // Limit to last 50 messages
    });

    // Get sender information
    const sendersInfo = await prisma.user.findMany({
      where: {
        id: {
          in: messages.map((m) => m.senderId),
        },
      },
      select: {
        id: true,
        username: true,
        allianceMembership: {
          select: {
            role: true,
          },
        },
      },
    });

    const senderMap = new Map(sendersInfo.map((s) => [s.id, s]));

    // Format messages
    const formattedMessages = messages.map((m) => {
      const sender = senderMap.get(m.senderId);
      return {
        id: m.id,
        senderId: m.senderId,
        senderUsername: sender?.username || 'Unknown',
        senderRole: sender?.allianceMembership?.role || 'member',
        subject: m.subject,
        body: m.body,
        sentAt: m.sentAt,
      };
    });

    res.json({
      success: true,
      data: { messages: formattedMessages },
    });
  } catch (error) {
    console.error('Error fetching alliance messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch alliance messages' });
  }
});

// POST /api/alliance/messages - Send circular message to all alliance members
router.post('/messages', async (req: AuthRequest, res: Response) => {
  try {
    const validation = allianceMessageSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { subject, body } = validation.data;

    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only leaders and officers can send circular messages
    if (!['founder', 'leader', 'officer'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only alliance leaders and officers can send circular messages',
      });
    }

    // Create alliance message
    const message = await prisma.allianceMessage.create({
      data: {
        allianceId: membership.allianceId,
        senderId: req.userId!,
        subject,
        body,
      },
    });

    res.status(201).json({
      success: true,
      data: { message },
    });
  } catch (error) {
    console.error('Error sending alliance message:', error);
    res.status(500).json({ success: false, error: 'Failed to send alliance message' });
  }
});

// ============================================
// ALLIANCE DIPLOMACY
// ============================================

// GET /api/alliance/diplomacy - Get all diplomatic relations
router.get('/diplomacy', async (req: AuthRequest, res: Response) => {
  try {
    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Get all diplomatic relations where this alliance is involved
    const relations = await prisma.allianceDiplomacy.findMany({
      where: {
        OR: [
          { initiatorId: membership.allianceId },
          { targetId: membership.allianceId },
        ],
      },
      include: {
        initiatorAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
        targetAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      success: true,
      data: { relations },
    });
  } catch (error) {
    console.error('Error fetching diplomacy:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch diplomacy' });
  }
});

// POST /api/alliance/diplomacy - Propose diplomatic relation
router.post('/diplomacy', async (req: AuthRequest, res: Response) => {
  try {
    const validation = diplomacySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { targetAllianceId, relationType } = validation.data;

    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founders and leaders can manage diplomacy
    if (!['founder', 'leader'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only alliance founders and leaders can manage diplomacy',
      });
    }

    // Cannot create relation with own alliance
    if (targetAllianceId === membership.allianceId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot create diplomatic relation with your own alliance',
      });
    }

    // Check if target alliance exists
    const targetAlliance = await prisma.alliance.findUnique({
      where: { id: targetAllianceId },
    });

    if (!targetAlliance) {
      return res.status(404).json({
        success: false,
        error: 'Target alliance not found',
      });
    }

    // Check if relation already exists
    const existingRelation = await prisma.allianceDiplomacy.findFirst({
      where: {
        OR: [
          { initiatorId: membership.allianceId, targetId: targetAllianceId },
          { initiatorId: targetAllianceId, targetId: membership.allianceId },
        ],
      },
    });

    if (existingRelation) {
      return res.status(400).json({
        success: false,
        error: 'A diplomatic relation already exists with this alliance',
      });
    }

    // Create diplomatic relation
    const relation = await prisma.allianceDiplomacy.create({
      data: {
        initiatorId: membership.allianceId,
        targetId: targetAllianceId,
        relationType,
        status: relationType === 'war' ? 'accepted' : 'pending', // War doesn't need acceptance
      },
      include: {
        initiatorAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
        targetAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: { relation },
    });
  } catch (error) {
    console.error('Error creating diplomatic relation:', error);
    res.status(500).json({ success: false, error: 'Failed to create diplomatic relation' });
  }
});

// PUT /api/alliance/diplomacy/:id/accept - Accept diplomatic proposal
router.put('/diplomacy/:id/accept', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founders and leaders can manage diplomacy
    if (!['founder', 'leader'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only alliance founders and leaders can manage diplomacy',
      });
    }

    // Get the diplomatic relation
    const relation = await prisma.allianceDiplomacy.findUnique({
      where: { id },
    });

    if (!relation) {
      return res.status(404).json({
        success: false,
        error: 'Diplomatic relation not found',
      });
    }

    // Only target alliance can accept
    if (relation.targetId !== membership.allianceId) {
      return res.status(403).json({
        success: false,
        error: 'Only the target alliance can accept this proposal',
      });
    }

    // Update status
    const updatedRelation = await prisma.allianceDiplomacy.update({
      where: { id },
      data: { status: 'accepted' },
      include: {
        initiatorAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
        targetAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: { relation: updatedRelation },
    });
  } catch (error) {
    console.error('Error accepting diplomatic relation:', error);
    res.status(500).json({ success: false, error: 'Failed to accept diplomatic relation' });
  }
});

// PUT /api/alliance/diplomacy/:id/reject - Reject diplomatic proposal
router.put('/diplomacy/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founders and leaders can manage diplomacy
    if (!['founder', 'leader'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only alliance founders and leaders can manage diplomacy',
      });
    }

    // Get the diplomatic relation
    const relation = await prisma.allianceDiplomacy.findUnique({
      where: { id },
    });

    if (!relation) {
      return res.status(404).json({
        success: false,
        error: 'Diplomatic relation not found',
      });
    }

    // Only target alliance can reject
    if (relation.targetId !== membership.allianceId) {
      return res.status(403).json({
        success: false,
        error: 'Only the target alliance can reject this proposal',
      });
    }

    // Update status
    const updatedRelation = await prisma.allianceDiplomacy.update({
      where: { id },
      data: { status: 'rejected' },
      include: {
        initiatorAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
        targetAlliance: {
          select: {
            id: true,
            name: true,
            tag: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: { relation: updatedRelation },
    });
  } catch (error) {
    console.error('Error rejecting diplomatic relation:', error);
    res.status(500).json({ success: false, error: 'Failed to reject diplomatic relation' });
  }
});

// DELETE /api/alliance/diplomacy/:id - Cancel/end diplomatic relation
router.delete('/diplomacy/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Get user's alliance membership
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({
        success: false,
        error: 'You are not in an alliance',
      });
    }

    // Only founders and leaders can manage diplomacy
    if (!['founder', 'leader'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only alliance founders and leaders can manage diplomacy',
      });
    }

    // Get the diplomatic relation
    const relation = await prisma.allianceDiplomacy.findUnique({
      where: { id },
    });

    if (!relation) {
      return res.status(404).json({
        success: false,
        error: 'Diplomatic relation not found',
      });
    }

    // Must be part of the relation
    if (relation.initiatorId !== membership.allianceId && relation.targetId !== membership.allianceId) {
      return res.status(403).json({
        success: false,
        error: 'You are not part of this diplomatic relation',
      });
    }

    // Delete the relation
    await prisma.allianceDiplomacy.delete({
      where: { id },
    });

    res.json({
      success: true,
      data: { message: 'Diplomatic relation ended' },
    });
  } catch (error) {
    console.error('Error ending diplomatic relation:', error);
    res.status(500).json({ success: false, error: 'Failed to end diplomatic relation' });
  }
});

// ============================================
// ALLIANCE ATTACK PLANNING
// ============================================

// GET /api/alliance/attack-plans - Get active attack plans for alliance
router.get('/attack-plans', async (req: AuthRequest, res: Response) => {
  try {
    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({ success: false, error: 'You are not in an alliance' });
    }

    const attackPlans = await prisma.attackPlan.findMany({
      where: {
        allianceId: membership.allianceId,
        status: 'active',
      },
      orderBy: { plannedAt: 'asc' },
    });

    // Get creator info for each plan
    const creatorIds = [...new Set(attackPlans.map((p) => p.creatorId))];
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, username: true },
    });
    const creatorMap = new Map(creators.map((c) => [c.id, c.username]));

    const plansWithDetails = attackPlans.map((plan) => ({
      id: plan.id,
      target: { x: plan.targetX, y: plan.targetY },
      targetName: plan.targetName,
      plannedAt: plan.plannedAt.toISOString(),
      description: plan.description,
      creator: creatorMap.get(plan.creatorId) || 'Unknown',
      createdAt: plan.createdAt.toISOString(),
    }));

    res.json({
      success: true,
      data: { attackPlans: plansWithDetails },
    });
  } catch (error) {
    console.error('Error fetching attack plans:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch attack plans' });
  }
});

// POST /api/alliance/attack-plans - Create new attack plan
router.post('/attack-plans', async (req: AuthRequest, res: Response) => {
  try {
    const { targetX, targetY, targetName, plannedAt, description } = req.body;

    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({ success: false, error: 'You are not in an alliance' });
    }

    // Only officers and above can create attack plans
    if (!['founder', 'leader', 'officer'].includes(membership.role)) {
      return res.status(403).json({
        success: false,
        error: 'Only officers and above can create attack plans',
      });
    }

    const plan = await prisma.attackPlan.create({
      data: {
        allianceId: membership.allianceId,
        creatorId: req.userId!,
        targetX,
        targetY,
        targetName: targetName || null,
        plannedAt: new Date(plannedAt),
        description: description || null,
      },
    });

    res.json({
      success: true,
      data: {
        attackPlan: {
          id: plan.id,
          target: { x: plan.targetX, y: plan.targetY },
          targetName: plan.targetName,
          plannedAt: plan.plannedAt.toISOString(),
          description: plan.description,
        },
      },
    });
  } catch (error) {
    console.error('Error creating attack plan:', error);
    res.status(500).json({ success: false, error: 'Failed to create attack plan' });
  }
});

// DELETE /api/alliance/attack-plans/:id - Cancel attack plan
router.delete('/attack-plans/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const membership = await prisma.allianceMember.findUnique({
      where: { userId: req.userId },
    });

    if (!membership) {
      return res.status(400).json({ success: false, error: 'You are not in an alliance' });
    }

    const plan = await prisma.attackPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      return res.status(404).json({ success: false, error: 'Attack plan not found' });
    }

    if (plan.allianceId !== membership.allianceId) {
      return res.status(403).json({ success: false, error: 'This plan belongs to another alliance' });
    }

    // Only creator, officers, and leaders can cancel
    if (plan.creatorId !== req.userId && !['founder', 'leader', 'officer'].includes(membership.role)) {
      return res.status(403).json({ success: false, error: 'You cannot cancel this attack plan' });
    }

    await prisma.attackPlan.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    res.json({
      success: true,
      data: { message: 'Attack plan cancelled' },
    });
  } catch (error) {
    console.error('Error cancelling attack plan:', error);
    res.status(500).json({ success: false, error: 'Failed to cancel attack plan' });
  }
});

export { router as allianceRouter };
