import { PrismaClient } from '../prisma/generated/client/index.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import Redis from 'ioredis';
import { redis } from '../src/lib/redis.js';
import { randomUUID } from 'crypto';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

// =============================================================================
// Model Performance Test
// Tests inter-step timing across different models with identical prompts
// =============================================================================

interface ModelConfig {
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'xai';
  model: string;
}

const MODELS_TO_TEST: ModelConfig[] = [
  // Claude models
  { name: 'Claude Sonnet 4', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  { name: 'Claude Sonnet 3.5', provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  { name: 'Claude Haiku 3.5', provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
  
  // OpenAI models
  { name: 'GPT-4o', provider: 'openai', model: 'gpt-4o' },
  { name: 'GPT-4o mini', provider: 'openai', model: 'gpt-4o-mini' },
  
  // Google models
  { name: 'Gemini 2.0 Flash', provider: 'google', model: 'gemini-2.0-flash-exp' },
  { name: 'Gemini 1.5 Flash', provider: 'google', model: 'gemini-1.5-flash' },
];

interface TestResult {
  modelName: string;
  totalDurationMs: number;
  stepCount: number;
  stepTimings: Array<{
    stepNumber: number;
    toolName: string;
    startTime: number;
    toolReadyTime?: number;
    toolDoneTime?: number;
    stepEndTime?: number;
    preToolDelayMs?: number; // Time from previous step end to this tool start
    toolExecutionMs?: number; // Time from tool start to tool done
    postToolDelayMs?: number; // Time from tool done to step end
  }>;
  success: boolean;
  error?: string;
}

async function testModel(config: ModelConfig): Promise<TestResult> {
  const testHaseefId = randomUUID();
  const testSpaceId = randomUUID();
  const userEntityId = randomUUID();
  
  console.log(`\n🧪 Testing: ${config.name}`);
  console.log(`   Provider: ${config.provider}, Model: ${config.model}`);
  
  const result: TestResult = {
    modelName: config.name,
    totalDurationMs: 0,
    stepCount: 0,
    stepTimings: [],
    success: false,
  };

  try {
    // Create test haseef with this model
    await prisma.haseef.create({
      data: {
        id: testHaseefId,
        name: `Test-${config.name}-${Date.now()}`,
        description: 'Performance test haseef',
        configJson: {
          version: '5',
          model: {
            provider: config.provider,
            model: config.model,
          },
          instructions: 'You are a test assistant. Follow instructions precisely.',
          consciousness: {
            maxTokens: 50000,
            minRecentCycles: 2,
            compactionStrategy: 'summarize',
          },
        },
      },
    });

    // Start the haseef process via API
    const startRes = await fetch(`http://localhost:3001/api/haseefs/${testHaseefId}/start`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.HSAFA_API_KEY || '' },
    });
    if (!startRes.ok) {
      throw new Error(`Failed to start haseef: ${startRes.status} ${await startRes.text()}`);
    }
    console.log(`   ✅ Haseef process started`);

    // Small delay to ensure process is ready
    await prisma.haseefTool.createMany({
      data: [
        {
          haseefId: testHaseefId,
          scope: 'test',
          name: 'calculate',
          description: 'Perform a simple calculation',
          inputSchema: {
            type: 'object',
            properties: {
              operation: { type: 'string', description: 'The calculation to perform' },
              result: { type: 'number', description: 'The expected result' },
            },
            required: ['operation', 'result'],
          },
          mode: 'sync',
          timeout: 5000,
        },
        {
          haseefId: testHaseefId,
          scope: 'test',
          name: 'store_fact',
          description: 'Store a fact you learned',
          inputSchema: {
            type: 'object',
            properties: {
              fact: { type: 'string', description: 'The fact to store' },
            },
            required: ['fact'],
          },
          mode: 'fire_and_forget',
          timeout: null,
        },
      ],
    });

    // Subscribe to SSE stream
    const streamChannel = `haseef:${testHaseefId}:stream`;
    const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    const events: Array<{ type: string; timestamp: number; data: any }> = [];
    let runStartTime = 0;
    let lastStepEndTime = 0;

    subscriber.on('message', (_channel: string, message: string) => {
      const timestamp = Date.now();
      const event = JSON.parse(message);
      events.push({ type: event.type, timestamp, data: event });

      if (event.type === 'run.started') {
        runStartTime = timestamp;
        lastStepEndTime = timestamp;
      }
    });

    await subscriber.subscribe(streamChannel);

    // Push test event that will trigger multi-step reasoning
    await redis.rpush(
      `haseef:${testHaseefId}:inbox`,
      JSON.stringify({
        eventId: randomUUID(),
        scope: 'test',
        type: 'test_request',
        data: {
          spaceId: testSpaceId,
          userId: userEntityId,
          message: 'Calculate 15 * 4, then store that result as a fact, then call done.',
        },
        createdAt: new Date().toISOString(),
      })
    );

    // Wake the process
    await redis.publish(`haseef:${testHaseefId}:wake`, '1');

    // Wait for completion (max 2 minutes)
    const startTime = Date.now();
    let completed = false;
    
    while (Date.now() - startTime < 120000) {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const finishEvent = events.find(e => e.type === 'run.finished');
      if (finishEvent) {
        completed = true;
        result.totalDurationMs = finishEvent.timestamp - runStartTime;
        break;
      }
    }

    await subscriber.unsubscribe(streamChannel);
    await subscriber.quit();

    if (!completed) {
      throw new Error('Test timed out after 2 minutes');
    }

    // Process events to extract step timings
    let currentStep: any = null;
    let stepNumber = 0;

    for (const event of events) {
      switch (event.type) {
        case 'tool.started':
          stepNumber++;
          currentStep = {
            stepNumber,
            toolName: event.data.toolName,
            startTime: event.timestamp,
            preToolDelayMs: lastStepEndTime ? event.timestamp - lastStepEndTime : 0,
          };
          break;

        case 'tool.ready':
          if (currentStep && currentStep.toolName === event.data.toolName) {
            currentStep.toolReadyTime = event.timestamp;
          }
          break;

        case 'tool.done':
          if (currentStep && currentStep.toolName === event.data.toolName) {
            currentStep.toolDoneTime = event.timestamp;
            currentStep.toolExecutionMs = event.timestamp - currentStep.startTime;
          }
          break;

        case 'step.finished':
          if (currentStep) {
            currentStep.stepEndTime = event.timestamp;
            currentStep.postToolDelayMs = currentStep.toolDoneTime
              ? event.timestamp - currentStep.toolDoneTime
              : 0;
            result.stepTimings.push(currentStep);
            lastStepEndTime = event.timestamp;
            currentStep = null;
          }
          break;
      }
    }

    result.stepCount = result.stepTimings.length;
    result.success = true;

    // Cleanup
    await prisma.run.deleteMany({ where: { haseefId: testHaseefId } });
    await prisma.haseefConsciousness.deleteMany({ where: { haseefId: testHaseefId } });
    await prisma.haseefTool.deleteMany({ where: { haseefId: testHaseefId } });
    await prisma.haseef.delete({ where: { id: testHaseefId } });

  } catch (error: any) {
    result.success = false;
    result.error = error?.message || String(error);
    console.error(`   ❌ Error: ${error?.message || String(error)}`);
    
    // Cleanup on error
    try {
      await prisma.run.deleteMany({ where: { haseefId: testHaseefId } });
      await prisma.haseefConsciousness.deleteMany({ where: { haseefId: testHaseefId } });
      await prisma.haseefTool.deleteMany({ where: { haseefId: testHaseefId } });
      await prisma.haseef.delete({ where: { id: testHaseefId } });
    } catch {}
  }

  return result;
}

function printResults(results: TestResult[]) {
  console.log('\n' + '='.repeat(80));
  console.log('MODEL PERFORMANCE COMPARISON');
  console.log('='.repeat(80));

  for (const result of results) {
    console.log(`\n📊 ${result.modelName}`);
    
    if (!result.success) {
      console.log(`   ❌ Failed: ${result.error}`);
      continue;
    }

    console.log(`   ✅ Success`);
    console.log(`   Total Duration: ${result.totalDurationMs}ms (${(result.totalDurationMs / 1000).toFixed(1)}s)`);
    console.log(`   Steps: ${result.stepCount}`);
    
    if (result.stepTimings.length > 0) {
      console.log('\n   Step-by-step breakdown:');
      for (const step of result.stepTimings) {
        console.log(`   Step ${step.stepNumber}: ${step.toolName}`);
        console.log(`      ⏳ Pre-tool delay:  ${step.preToolDelayMs || 0}ms (LLM reasoning)`);
        console.log(`      ⚙️  Tool execution:  ${step.toolExecutionMs || 0}ms`);
        console.log(`      📝 Post-tool delay: ${step.postToolDelayMs || 0}ms`);
      }

      // Calculate averages
      const avgPreDelay = result.stepTimings.reduce((sum, s) => sum + (s.preToolDelayMs || 0), 0) / result.stepTimings.length;
      const avgToolExec = result.stepTimings.reduce((sum, s) => sum + (s.toolExecutionMs || 0), 0) / result.stepTimings.length;
      
      console.log(`\n   📈 Averages:`);
      console.log(`      Pre-tool delay (reasoning): ${avgPreDelay.toFixed(0)}ms`);
      console.log(`      Tool execution:             ${avgToolExec.toFixed(0)}ms`);
    }
  }

  // Summary table
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY TABLE');
  console.log('='.repeat(80));
  console.log('\nModel                    | Total Time | Avg Reasoning | Avg Execution');
  console.log('-'.repeat(75));

  for (const result of results) {
    if (!result.success) continue;
    
    const avgPreDelay = result.stepTimings.reduce((sum, s) => sum + (s.preToolDelayMs || 0), 0) / result.stepTimings.length;
    const avgToolExec = result.stepTimings.reduce((sum, s) => sum + (s.toolExecutionMs || 0), 0) / result.stepTimings.length;
    
    const name = result.modelName.padEnd(24);
    const total = `${(result.totalDurationMs / 1000).toFixed(1)}s`.padEnd(10);
    const reasoning = `${(avgPreDelay / 1000).toFixed(2)}s`.padEnd(13);
    const execution = `${(avgToolExec / 1000).toFixed(2)}s`;
    
    console.log(`${name} | ${total} | ${reasoning} | ${execution}`);
  }

  console.log('\n' + '='.repeat(80));
}

async function main() {
  console.log('🚀 Starting model performance tests...\n');
  console.log(`Testing ${MODELS_TO_TEST.length} models with identical multi-step scenario`);
  
  const results: TestResult[] = [];

  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model);
    results.push(result);
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  printResults(results);

  await prisma.$disconnect();
  await redis.quit();
  
  console.log('\n✅ All tests complete!\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
