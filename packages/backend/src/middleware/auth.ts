import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

const JWT_SECRET = process.env.JWT_SECRET || 'travian-dev-secret';

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    username: string;
    tribe: string;
  };
}

export interface JwtPayload {
  userId: string;
  email: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'No token provided' });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.userId = decoded.userId;

    // Optionally load full user
    prisma.user
      .findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, username: true, tribe: true },
      })
      .then((user) => {
        if (!user) {
          return res.status(401).json({ success: false, error: 'User not found' });
        }
        req.user = user;
        next();
      })
      .catch(() => {
        res.status(500).json({ success: false, error: 'Failed to verify user' });
      });
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

export function generateToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}
