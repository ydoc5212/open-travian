import { Server as SocketServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const userSockets = new Map<string, Set<string>>(); // userId -> Set of socket ids

export function setupSocketHandlers(io: SocketServer) {
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || 'travian-dev-secret'
      ) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    console.log(`User ${userId} connected via socket ${socket.id}`);

    // Track socket for this user
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Join user-specific room
    socket.join(`user:${userId}`);

    // Handle joining village room for real-time updates
    socket.on('join:village', (villageId: string) => {
      socket.join(`village:${villageId}`);
      console.log(`Socket ${socket.id} joined village:${villageId}`);
    });

    socket.on('leave:village', (villageId: string) => {
      socket.leave(`village:${villageId}`);
    });

    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected (socket ${socket.id})`);
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });
}

// Helper functions to emit events to specific users/villages
export function emitToUser(io: SocketServer, userId: string, event: string, data: any) {
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToVillage(io: SocketServer, villageId: string, event: string, data: any) {
  io.to(`village:${villageId}`).emit(event, data);
}

export function getUserSocketCount(userId: string): number {
  return userSockets.get(userId)?.size || 0;
}
