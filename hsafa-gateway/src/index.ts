import express from 'express';
import { createServer } from 'http';
import { agentsRouter } from './routes/agents.js';
import { entitiesRouter } from './routes/entities.js';
import { smartSpacesRouter } from './routes/smart-spaces.js';
import { clientsRouter } from './routes/clients.js';
import { runsRouter } from './routes/runs.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { startAllProcesses, stopAllProcesses, getProcessCount } from './lib/process-manager.js';
import { startPlanScheduler, stopPlanScheduler } from './lib/plan-scheduler.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-public-key, x-secret-key, x-request-id, Cache-Control');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control, Connection, X-Accel-Buffering');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());

// Routes
app.use('/api/agents', agentsRouter);
app.use('/api/entities', entitiesRouter);
app.use('/api/smart-spaces', smartSpacesRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/runs', runsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-gateway',
    version: '3.0.0',
    processes: getProcessCount(),
  });
});

server.listen(PORT, async () => {
  console.log(`Hsafa Gateway v3 running on http://localhost:${PORT}`);

  try {
    await prisma.$connect();
    console.log('Database connected');
  } catch (error) {
    console.error('Database connection failed:', error);
  }

  try {
    await redis.ping();
    console.log('Redis connected');
  } catch (error) {
    console.error('Redis connection failed:', error);
  }

  // v3: Start all agent processes
  try {
    await startAllProcesses();
  } catch (error) {
    console.error('Failed to start agent processes:', error);
  }

  // v3: Start plan scheduler (BullMQ)
  try {
    await startPlanScheduler();
  } catch (error) {
    console.error('Failed to start plan scheduler:', error);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  try {
    await stopPlanScheduler();
    await stopAllProcesses();
  } catch (error) {
    console.error('Error stopping processes:', error);
  }

  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  // Force exit after 15s
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
