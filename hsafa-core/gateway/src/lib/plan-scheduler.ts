import { Queue, Worker, type Job } from 'bullmq';
import { CronExpressionParser } from 'cron-parser';
import { prisma } from './db.js';
import { pushPlanEvent } from './inbox.js';

// =============================================================================
// Plan Scheduler (v3)
//
// Uses BullMQ for exact-time job scheduling. No polling.
//
// - One-shot plans (scheduledAt / runAfter): delayed job fires at exact time
// - Recurring plans (cron): repeatable job with cron pattern
// - On startup: reconciles DB plans → BullMQ jobs
// - set_plans tool enqueues jobs; delete_plans removes them
// =============================================================================

const QUEUE_NAME = 'plan-scheduler';

let queue: Queue | null = null;
let worker: Worker | null = null;

/** Redis connection config extracted from REDIS_URL env. */
function getRedisConnection() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379', 10),
    password: parsed.password || undefined,
    username: parsed.username || undefined,
  };
}

// =============================================================================
// Queue + Worker setup
// =============================================================================

/**
 * Start the plan scheduler. Creates BullMQ queue + worker,
 * then reconciles all pending DB plans into the queue.
 */
export async function startPlanScheduler(): Promise<void> {
  const connection = getRedisConnection();

  queue = new Queue(QUEUE_NAME, { connection });

  worker = new Worker(QUEUE_NAME, handlePlanJob, {
    connection,
    concurrency: 5,
  });

  worker.on('failed', (job, err) => {
    console.warn(`[plan-scheduler] Job ${job?.id} failed:`, err.message);
  });

  // Reconcile DB plans → BullMQ on startup
  await reconcilePlans();

  console.log('[plan-scheduler] Started');
}

/**
 * Stop the scheduler gracefully.
 */
export async function stopPlanScheduler(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  console.log('[plan-scheduler] Stopped');
}

// =============================================================================
// Job handler — fires when a plan is due
// =============================================================================

interface PlanJobData {
  planId: string;
  agentEntityId: string;
}

async function handlePlanJob(job: Job<PlanJobData>): Promise<void> {
  const { planId, agentEntityId } = job.data;

  // Load the plan from DB (it may have been deleted or completed)
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== 'pending') return;

  // Push plan event to agent's inbox
  await pushPlanEvent(agentEntityId, {
    planId: plan.id,
    planName: plan.name,
    instruction: plan.instruction ?? '',
  });

  // Update plan record
  if (plan.isRecurring && plan.cron) {
    // Compute next run from cron
    const nextRunAt = getNextCronDate(plan.cron);
    await prisma.plan.update({
      where: { id: planId },
      data: { lastRunAt: new Date(), nextRunAt },
    });
  } else {
    // One-shot: mark as completed
    await prisma.plan.update({
      where: { id: planId },
      data: {
        status: 'completed',
        lastRunAt: new Date(),
        completedAt: new Date(),
        nextRunAt: null,
      },
    });
  }

  console.log(`[plan-scheduler] Fired plan "${plan.name}" for agent ${agentEntityId}`);
}

// =============================================================================
// Enqueue / remove jobs — called by set_plans and delete_plans tools
// =============================================================================

/**
 * Enqueue a plan as a BullMQ job.
 * - Cron plans: repeatable job with cron pattern
 * - One-shot plans: delayed job firing at nextRunAt
 */
export async function enqueuePlan(plan: {
  id: string;
  entityId: string;
  cron: string | null;
  nextRunAt: Date | null;
  isRecurring: boolean;
}): Promise<void> {
  if (!queue) return;

  const jobData: PlanJobData = {
    planId: plan.id,
    agentEntityId: plan.entityId,
  };

  if (plan.isRecurring && plan.cron) {
    // Repeatable cron job
    await queue.add(`plan:${plan.id}`, jobData, {
      repeat: { pattern: plan.cron },
      jobId: plan.id,
      removeOnComplete: true,
      removeOnFail: 5,
    });
  } else if (plan.nextRunAt) {
    // One-shot delayed job
    const delay = Math.max(plan.nextRunAt.getTime() - Date.now(), 0);
    await queue.add(`plan:${plan.id}`, jobData, {
      delay,
      jobId: plan.id,
      removeOnComplete: true,
      removeOnFail: 5,
    });
  }
}

/**
 * Remove a plan's BullMQ job(s). Called when a plan is deleted or completed.
 */
export async function dequeuePlan(planId: string, cron?: string | null): Promise<void> {
  if (!queue) return;

  // Remove delayed/waiting job
  const job = await queue.getJob(planId);
  if (job) {
    await job.remove().catch(() => {});
  }

  // Remove repeatable job if cron
  if (cron) {
    await queue.removeRepeatable(`plan:${planId}`, { pattern: cron }).catch(() => {});
  }
}

// =============================================================================
// Startup reconciliation — ensure all pending DB plans have BullMQ jobs
// =============================================================================

async function reconcilePlans(): Promise<void> {
  const pendingPlans = await prisma.plan.findMany({
    where: { status: 'pending' },
    select: {
      id: true,
      entityId: true,
      cron: true,
      nextRunAt: true,
      isRecurring: true,
    },
  });

  let enqueued = 0;
  for (const plan of pendingPlans) {
    // For cron plans that have no nextRunAt, compute one
    if (plan.isRecurring && plan.cron && !plan.nextRunAt) {
      const nextRunAt = getNextCronDate(plan.cron);
      await prisma.plan.update({
        where: { id: plan.id },
        data: { nextRunAt },
      });
      plan.nextRunAt = nextRunAt;
    }

    // Skip plans with no future run time
    if (!plan.isRecurring && (!plan.nextRunAt || plan.nextRunAt.getTime() < Date.now())) {
      // One-shot plan that's already past — mark completed
      await prisma.plan.update({
        where: { id: plan.id },
        data: { status: 'completed', completedAt: new Date() },
      });
      continue;
    }

    await enqueuePlan(plan);
    enqueued++;
  }

  if (enqueued > 0) {
    console.log(`[plan-scheduler] Reconciled ${enqueued} pending plans`);
  }
}

// =============================================================================
// Cron helper
// =============================================================================

function getNextCronDate(cronExpression: string): Date {
  const cron = CronExpressionParser.parse(cronExpression, { currentDate: new Date() });
  return cron.next().toDate();
}
