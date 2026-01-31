import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { redis } from './redis.js';
import { prisma } from './db.js';

interface DeviceConnection {
  ws: WebSocket;
  deviceId: string;
}

const deviceConnections = new Map<string, DeviceConnection>();

export function setupWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ 
    server,
    path: '/devices/connect'
  });

  wss.on('connection', async (ws: WebSocket) => {
    let deviceConnection: DeviceConnection | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'device.register': {
            const { deviceKey, displayName, capabilities } = message.data;

            // Auto-create or update device on first connection
            const device = await prisma.device.upsert({
              where: { deviceKey },
              create: {
                deviceKey,
                displayName,
                capabilities: capabilities || {},
                lastSeenAt: new Date(),
              },
              update: {
                displayName,  // Update name if changed
                capabilities: capabilities || undefined,
                lastSeenAt: new Date(),
              },
            });

            deviceConnection = {
              ws,
              deviceId: device.id,
            };

            deviceConnections.set(device.id, deviceConnection);

            ws.send(JSON.stringify({
              type: 'device.registered',
              data: {
                deviceId: device.id,
              },
            }));

            await redis.setex(`device:${device.id}:presence`, 60, 'online');

            console.log(`✅ Device connected: ${deviceKey} (${device.id})`);
            break;
          }

          case 'tool.result': {
            const { runId, callId, result } = message.data;

            await prisma.toolResult.create({
              data: {
                runId,
                callId,
                result,
                source: 'device',
              },
            });

            await prisma.toolCall.update({
              where: { runId_callId: { runId, callId } },
              data: {
                status: 'completed',
                completedAt: new Date(),
              },
            });

            await redis.xadd(
              `run:${runId}:stream`,
              '*',
              'type', 'tool.result.received',
              'ts', new Date().toISOString(),
              'payload', JSON.stringify({ callId, result })
            );

            await redis.publish(
              `run:${runId}:notify`,
              JSON.stringify({ type: 'tool.result.received', callId })
            );

            console.log(`✅ Tool result received: ${callId}`);
            break;
          }

          case 'ping': {
            if (deviceConnection) {
              await redis.setex(`device:${deviceConnection.deviceId}:presence`, 60, 'online');
            }
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    });

    ws.on('close', async () => {
      if (deviceConnection) {
        deviceConnections.delete(deviceConnection.deviceId);
        await redis.del(`device:${deviceConnection.deviceId}:presence`);

        console.log(`🔌 Device disconnected: ${deviceConnection.deviceId}`);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log('🔌 WebSocket server ready at /devices/connect');
  return wss;
}

export async function sendToolCallToDevice(deviceId: string, toolCall: {
  runId: string;
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
}) {
  const connection = deviceConnections.get(deviceId);
  
  if (!connection) {
    throw new Error(`Device ${deviceId} not connected`);
  }

  connection.ws.send(JSON.stringify({
    type: 'tool.call.request',
    data: toolCall,
  }));

  await redis.xadd(
    `device:${deviceId}:inbox`,
    '*',
    'type', 'tool.call.request',
    'ts', new Date().toISOString(),
    'payload', JSON.stringify(toolCall)
  );
}
