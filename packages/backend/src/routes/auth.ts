import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../index';
import { generateToken } from '../middleware/auth';
import { GAME_CONFIG, RESOURCE_FIELD_DATA } from '@travian/shared';
import type { ResourceFieldType } from '@travian/shared';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  username: z.string().min(3).max(20),
  tribe: z.enum(['romans', 'gauls', 'teutons']),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// Helper to find a free coordinate for new village
async function findFreeCoordinate(): Promise<{ x: number; y: number }> {
  const { MAP_MIN, MAP_MAX } = GAME_CONFIG;

  // Start from center and spiral outward
  for (let radius = 0; radius <= (MAP_MAX - MAP_MIN) / 2; radius++) {
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        if (Math.abs(x) !== radius && Math.abs(y) !== radius) continue; // Only check perimeter

        const existing = await prisma.village.findUnique({
          where: { xCoord_yCoord: { xCoord: x, yCoord: y } },
        });

        if (!existing) {
          return { x, y };
        }
      }
    }
  }

  // Fallback to random
  return {
    x: Math.floor(Math.random() * (MAP_MAX - MAP_MIN)) + MAP_MIN,
    y: Math.floor(Math.random() * (MAP_MAX - MAP_MIN)) + MAP_MIN,
  };
}

// Register new user
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { email, password, username, tribe } = validation.data;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: existingUser.email === email ? 'Email already registered' : 'Username already taken',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Find coordinate for starting village
    const coord = await findFreeCoordinate();

    // Create user with starting village in transaction
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email,
          username,
          passwordHash,
          tribe,
        },
      });

      // Create starting village
      const village = await tx.village.create({
        data: {
          userId: newUser.id,
          name: `${username}'s Village`,
          xCoord: coord.x,
          yCoord: coord.y,
          isCapital: true,
          lumber: GAME_CONFIG.STARTING_RESOURCES.lumber,
          clay: GAME_CONFIG.STARTING_RESOURCES.clay,
          iron: GAME_CONFIG.STARTING_RESOURCES.iron,
          crop: GAME_CONFIG.STARTING_RESOURCES.crop,
          warehouseCapacity: GAME_CONFIG.BASE_WAREHOUSE_CAPACITY,
          granaryCapacity: GAME_CONFIG.BASE_GRANARY_CAPACITY,
        },
      });

      // Create resource fields (18 fields in classic layout)
      const resourceFieldLayout = GAME_CONFIG.RESOURCE_FIELD_LAYOUT;
      for (let i = 0; i < 18; i++) {
        await tx.resourceField.create({
          data: {
            villageId: village.id,
            slot: i + 1,
            type: resourceFieldLayout[i],
            level: 0, // Start at level 0, needs to be built
          },
        });
      }

      // Create empty building slots (22 slots for village center)
      for (let i = 1; i <= 22; i++) {
        await tx.building.create({
          data: {
            villageId: village.id,
            slot: i,
            type: null,
            level: 0,
          },
        });
      }

      return newUser;
    });

    // Generate token
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          tribe: user.tribe,
        },
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, error: 'Failed to register' });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { email, password } = validation.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Generate token
    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          tribe: user.tribe,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Failed to login' });
  }
});

// Get current user
router.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  try {
    const jwt = await import('jsonwebtoken');
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'travian-dev-secret') as {
      userId: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, username: true, tribe: true },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: { user } });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

export { router as authRouter };
