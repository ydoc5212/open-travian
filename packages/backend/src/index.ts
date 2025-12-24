import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { PrismaClient } from '@prisma/client';

import { authRouter } from './routes/auth';
import { villageRouter } from './routes/village';
import { buildingRouter } from './routes/building';
import { resourceRouter } from './routes/resource';
import { troopsRouter } from './routes/troops';
import { combatRouter } from './routes/combat';
import { reportsRouter } from './routes/reports';
import { authMiddleware } from './middleware/auth';
import { setupSocketHandlers } from './socket';
import { startJobProcessor } from './jobs/processor';

const app = express();
const httpServer = createServer(app);
const io = new SocketServer(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

export const prisma = new PrismaClient();

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
app.use('/api/villages', authMiddleware, villageRouter);
app.use('/api/buildings', authMiddleware, buildingRouter);
app.use('/api/resources', authMiddleware, resourceRouter);
app.use('/api/troops', authMiddleware, troopsRouter);
app.use('/api/combat', authMiddleware, combatRouter);
app.use('/api/reports', authMiddleware, reportsRouter);

// Socket.io setup
setupSocketHandlers(io);

// Make io available to routes
app.set('io', io);

const PORT = process.env.PORT || 3001;

async function main() {
  try {
    await prisma.$connect();
    console.log('Connected to PostgreSQL');

    // Start background job processor
    await startJobProcessor(io);
    console.log('Job processor started');

    httpServer.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});
