# Hsafa Scope Examples

> Real code examples for common scope patterns. Copy and adapt these.

## Example 1: REST API Wrapper

A scope that wraps an external REST API (e.g. weather, stock prices, etc.):

```typescript
// src/tools.ts
export const tools = [
  {
    name: 'get_weather',
    description: 'Get current weather for a city. Returns temperature, conditions, humidity, and wind speed.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name (e.g. "Tokyo", "New York")' },
        units: { type: 'string', enum: ['metric', 'imperial'], description: 'Temperature units. Defaults to metric.' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get_forecast',
    description: 'Get 5-day weather forecast for a city.',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        days: { type: 'number', description: 'Number of days (1-5). Defaults to 3.' },
      },
      required: ['city'],
    },
  },
];
```

```typescript
// src/handler.ts
const API_KEY = process.env.WEATHER_API_KEY!;
const BASE_URL = 'https://api.openweathermap.org/data/2.5';

export const handlers = {
  async get_weather(args: { city: string; units?: string }) {
    const units = args.units || 'metric';
    const res = await fetch(
      `${BASE_URL}/weather?q=${encodeURIComponent(args.city)}&units=${units}&appid=${API_KEY}`
    );
    if (!res.ok) return { error: `City "${args.city}" not found` };
    const data = await res.json();
    return {
      city: data.name,
      temperature: data.main.temp,
      feelsLike: data.main.feels_like,
      conditions: data.weather[0].description,
      humidity: data.main.humidity,
      windSpeed: data.wind.speed,
      units,
    };
  },

  async get_forecast(args: { city: string; days?: number }) {
    const days = Math.min(args.days || 3, 5);
    const res = await fetch(
      `${BASE_URL}/forecast?q=${encodeURIComponent(args.city)}&cnt=${days * 8}&appid=${API_KEY}&units=metric`
    );
    if (!res.ok) return { error: `City "${args.city}" not found` };
    const data = await res.json();
    // Group by day
    const byDay: Record<string, any[]> = {};
    for (const item of data.list) {
      const day = item.dt_txt.split(' ')[0];
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push({
        time: item.dt_txt.split(' ')[1],
        temp: item.main.temp,
        conditions: item.weather[0].description,
      });
    }
    return { city: data.city.name, forecast: byDay };
  },
};
```

## Example 2: Database Scope

A scope that connects to a database and provides query tools:

```typescript
// src/index.ts
import { HsafaSDK } from '@hsafa/sdk';
import pg from 'pg';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await sdk.registerTools([
  {
    name: 'query',
    description: 'Run a read-only SQL query (SELECT only). Returns rows as JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The SELECT query to run' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all tables in the database with row counts.',
    inputSchema: { type: 'object', properties: {} },
  },
]);

sdk.onToolCall('query', async (args) => {
  const sql = (args.sql as string).trim();
  if (!sql.toUpperCase().startsWith('SELECT')) {
    return { error: 'Only SELECT queries are allowed' };
  }
  try {
    const result = await pool.query(sql);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err: any) {
    return { error: err.message };
  }
});

sdk.onToolCall('list_tables', async () => {
  const result = await pool.query(`
    SELECT tablename, n_live_tup AS approx_rows
    FROM pg_stat_user_tables
    ORDER BY tablename
  `);
  return { tables: result.rows };
});

sdk.connect();
console.log(`[${sdk.scope}] Connected — ready for tool calls`);

process.on('SIGINT', async () => {
  sdk.disconnect();
  await pool.end();
  process.exit(0);
});
```

## Example 3: Webhook Listener + Sense Events

A scope that receives webhooks and pushes them as sense events:

```typescript
// src/index.ts
import { HsafaSDK } from '@hsafa/sdk';
import express from 'express';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

const HASEEF_ID = process.env.HASEEF_ID!;
const events: Array<{ type: string; data: any; receivedAt: string }> = [];

// Register tools
await sdk.registerTools([
  {
    name: 'list_events',
    description: 'List recent webhook events received by this scope.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max events to return (default 10)' },
        type: { type: 'string', description: 'Filter by event type' },
      },
    },
  },
]);

sdk.onToolCall('list_events', async (args) => {
  let filtered = events;
  if (args.type) filtered = filtered.filter(e => e.type === args.type);
  const limit = (args.limit as number) || 10;
  return { events: filtered.slice(-limit), totalCount: filtered.length };
});

// Connect to Core for tool calls
sdk.connect();

// Start webhook server
const app = express();
app.use(express.json());

app.post('/webhook', async (req, res) => {
  const event = {
    type: req.body.type || 'unknown',
    data: req.body,
    receivedAt: new Date().toISOString(),
  };

  events.push(event);
  if (events.length > 1000) events.splice(0, events.length - 1000);

  // Push as sense event to Haseef
  await sdk.pushEvent({
    type: `webhook_${event.type}`,
    haseefId: HASEEF_ID,
    data: {
      ...event.data,
      formattedContext: [
        `[WEBHOOK RECEIVED: ${event.type}]`,
        `Payload: ${JSON.stringify(event.data, null, 2)}`,
        '',
        '>>> Process this webhook event.',
      ].join('\n'),
    },
  }).catch(err => console.error('Failed to push event:', err));

  res.json({ received: true });
});

app.listen(3100, () => {
  console.log(`[${sdk.scope}] Webhook server on :3100, SDK connected to Core`);
});
```

## Example 4: Monitoring + Alerts

A scope that polls a system and pushes alerts:

```typescript
import { HsafaSDK } from '@hsafa/sdk';

const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: 'monitoring',
});

const HASEEF_ID = process.env.HASEEF_ID!;

await sdk.registerTools([
  {
    name: 'get_system_status',
    description: 'Get current system health metrics (CPU, memory, disk, active connections).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_alert_history',
    description: 'Get recent alerts with timestamps and severity.',
    input: { limit: 'number?', severity: 'string?' },
  },
]);

sdk.onToolCall('get_system_status', async () => {
  // Replace with actual monitoring logic
  return {
    cpu: { usage: 45, cores: 8 },
    memory: { usedGb: 12.3, totalGb: 32, percent: 38 },
    disk: { usedGb: 180, totalGb: 500, percent: 36 },
    activeConnections: 142,
    uptime: '14d 6h',
  };
});

sdk.onToolCall('get_alert_history', async (args) => {
  // Replace with actual alert store
  return { alerts: [], totalCount: 0 };
});

sdk.connect();

// Polling loop — check every 60s
setInterval(async () => {
  const cpuUsage = await getCpuUsage(); // your implementation
  if (cpuUsage > 80) {
    await sdk.pushEvent({
      type: 'cpu_alert',
      haseefId: HASEEF_ID,
      data: {
        severity: cpuUsage > 95 ? 'critical' : 'warning',
        cpuUsage,
        formattedContext: [
          `[CPU ALERT — ${cpuUsage > 95 ? 'CRITICAL' : 'WARNING'}]`,
          `CPU usage: ${cpuUsage}% (threshold: 80%)`,
          '',
          '>>> Decide what to do.',
        ].join('\n'),
      },
    });
  }
}, 60_000);
```

## Example 5: Using `inputToJsonSchema` Helper

For simple tools, use the shorthand:

```typescript
import { HsafaSDK, inputToJsonSchema } from '@hsafa/sdk';

const sdk = new HsafaSDK({ /* ... */ });

await sdk.registerTools([
  {
    name: 'send_notification',
    description: 'Send a push notification to a user.',
    input: {
      userId: 'string',
      title: 'string',
      body: 'string',
      priority: 'string?',  // optional
    },
  },
  {
    name: 'bulk_send',
    description: 'Send notification to multiple users.',
    input: {
      userIds: 'string[]',   // array of strings
      title: 'string',
      body: 'string',
    },
  },
]);
```

The SDK automatically converts the `input` shorthand to JSON Schema when registering.

## Common Patterns

### Retry with Backoff
For unreliable external services:

```typescript
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw new Error('Unreachable');
}

sdk.onToolCall('fetch_data', async (args) => {
  return await withRetry(() => externalApi.getData(args.query as string));
});
```

### Config from Environment
Load scope-specific configuration:

```typescript
const config = {
  apiKey: process.env.API_KEY || '',
  region: process.env.REGION || 'us-east-1',
  maxResults: parseInt(process.env.MAX_RESULTS || '100'),
  readOnly: process.env.READ_ONLY !== 'false',
};

if (!config.apiKey) {
  console.error('[my-scope] API_KEY env var is required');
  process.exit(1);
}
```

### Logging Events

```typescript
sdk.on('run.started', (e) =>
  console.log(`[${sdk.scope}] Run ${e.runId} started for ${e.haseef.name}`)
);
sdk.on('tool.error', (e) =>
  console.error(`[${sdk.scope}] ${e.toolName} error:`, e.error)
);
sdk.on('run.completed', (e) =>
  console.log(`[${sdk.scope}] Run ${e.runId} done in ${e.durationMs}ms`)
);
```
