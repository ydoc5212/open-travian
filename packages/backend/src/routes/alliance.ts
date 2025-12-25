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

export { router as allianceRouter };
