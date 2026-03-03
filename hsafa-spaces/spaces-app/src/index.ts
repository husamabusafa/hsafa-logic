// BigInt JSON serialization (Prisma seq fields are BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

import express from 'express';
import { createServer } from 'http';
import { smartSpacesRouter } from './routes/smart-spaces.js';
import { clientsRouter } from './routes/clients.js';
import { entitiesRouter } from './routes/entities.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3002;

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
app.use('/api/smart-spaces', smartSpacesRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/entities', entitiesRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'hsafa-spaces-app',
    version: '1.0.0',
  });
});

server.listen(PORT, async () => {
  console.log(`Hsafa Spaces App v1 running on http://localhost:${PORT}`);

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
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');

  server.close(() => {
    prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
