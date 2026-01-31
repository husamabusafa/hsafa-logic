import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { agentConfigRouter } from './routes/agent-config.js';
import { agentsRouter } from './routes/agents.js';
import { runsRouter } from './routes/runs.js';
import { prisma } from './lib/db.js';
import { redis } from './lib/redis.js';
import { setupWebSocketServer } from './lib/websocket.js';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/agent-config', agentConfigRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/runs', runsRouter);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'hsafa-gateway' });
});

setupWebSocketServer(server);

server.listen(PORT, async () => {
  console.log(`🚀 Hsafa Gateway running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   POST http://localhost:${PORT}/api/agents`);
  console.log(`   POST http://localhost:${PORT}/api/runs`);
  console.log(`   GET  http://localhost:${PORT}/api/runs/:runId`);
  console.log(`   GET  http://localhost:${PORT}/api/runs/:runId/stream (SSE)`);
  console.log(`   GET  http://localhost:${PORT}/api/runs/:runId/events`);
  console.log(`   POST http://localhost:${PORT}/api/runs/:runId/tool-results`);
  console.log(`   GET  http://localhost:${PORT}/api/agent-config/:agentName (legacy)`);
  console.log(`   WS   ws://localhost:${PORT}/devices/connect`);
  
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
  
  try {
    await redis.ping();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('❌ Redis connection failed:', error);
  }
});
