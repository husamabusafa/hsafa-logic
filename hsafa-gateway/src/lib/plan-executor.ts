import { Prisma } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import { prisma } from './db.js';
import { executeRun } from './run-runner.js';

/**
 * Plan Executor
 *
 * Finds plans that are due (nextRunAt <= now, status = pending),
 * creates a run for the agent, and updates the plan after execution.
 *
 * Plan runs are special:
 * - The agent is NOT in any specific space
 * - The agent must use goToSpace to interact with spaces
 * - The run's response is NOT auto-posted to a space
 * - The run metadata contains isPlanRun + plan details
 */

/**
 * Check for due plans and execute them.
 * Called periodically by the plan scheduler.
 */
export async function executeDuePlans(): Promise<void> {
  const now = new Date();

  // Find all pending plans whose next run time has passed
  const duePlans = await (prisma.plan as any).findMany({
    where: {
      status: 'pending',
      nextRunAt: { lte: now },
    },
    orderBy: [{ nextRunAt: 'asc' }],
  });

  if (duePlans.length === 0) return;

  console.log(`[plan-executor] Found ${duePlans.length} due plan(s)`);

  for (const plan of duePlans) {
    try {
      await executePlan(plan);
    } catch (err) {
      console.error(`[plan-executor] Failed to execute plan "${plan.name}" (${plan.id}):`, err);
      // Don't let one failed plan block the others
    }
  }
}

async function executePlan(plan: any): Promise<void> {
  const { id: planId, entityId, name, description, instruction, isRecurring, cron } = plan;

  console.log(`[plan-executor] Executing plan "${name}" (${planId}) for entity ${entityId}`);

  // Mark plan as running
  await (prisma.plan as any).update({
    where: { id: planId },
    data: { status: 'running' },
  });

  try {
    // Look up the agent entity to find agentId
    const entity = await prisma.entity.findUnique({
      where: { id: entityId },
      select: { agentId: true },
    });

    if (!entity?.agentId) {
      throw new Error(`Entity ${entityId} is not an agent or has no agentId`);
    }

    // Find a space the agent is a member of (needed for run schema)
    // Plan runs are "spaceless" but we need a smartSpaceId for the DB
    const membership = await prisma.smartSpaceMembership.findFirst({
      where: { entityId },
      select: { smartSpaceId: true },
    });

    if (!membership) {
      throw new Error(`Agent entity ${entityId} is not a member of any space`);
    }

    // Create the plan-triggered run
    const run = await prisma.run.create({
      data: {
        smartSpaceId: membership.smartSpaceId,
        agentEntityId: entityId,
        agentId: entity.agentId,
        triggeredById: entityId, // triggered by itself (plan)
        status: 'queued',
        metadata: {
          isPlanRun: true,
          planId,
          planName: name,
          planDescription: description,
          planInstruction: instruction,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    console.log(`[plan-executor] Created run ${run.id} for plan "${name}"`);

    // Execute the run (blocking — we need to know when it finishes to update the plan)
    await executeRun(run.id);

    // Update plan after successful execution
    const updateData: any = {
      lastRunAt: new Date(),
    };

    if (isRecurring && cron) {
      // Compute next run time for recurring plans
      try {
        const expr = CronExpressionParser.parse(cron);
        updateData.nextRunAt = expr.next().toDate();
        updateData.status = 'pending'; // Back to pending for next trigger
      } catch {
        console.error(`[plan-executor] Invalid cron "${cron}" for plan "${name}", marking completed`);
        updateData.status = 'completed';
        updateData.completedAt = new Date();
      }
    } else {
      // One-time plan — mark as completed
      updateData.status = 'completed';
      updateData.completedAt = new Date();
    }

    await (prisma.plan as any).update({
      where: { id: planId },
      data: updateData,
    });

    console.log(`[plan-executor] Plan "${name}" ${isRecurring ? `rescheduled (next: ${updateData.nextRunAt?.toISOString()})` : 'completed'}`);
  } catch (err) {
    // If run fails, put plan back to pending so it can retry
    // (nextRunAt is still in the past, so it will be picked up again)
    console.error(`[plan-executor] Plan "${name}" execution failed, reverting to pending:`, err);
    await (prisma.plan as any).update({
      where: { id: planId },
      data: { status: 'pending' },
    });
  }
}
