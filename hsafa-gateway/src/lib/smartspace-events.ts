import { redis } from './redis.js';

/**
 * Context for SmartSpace events.
 * 
 * All events in a SmartSpace can come from:
 * - Human entities (users)
 * - Agent entities (AI agents)
 * 
 * The `entityId` identifies who/what produced the event.
 * The `entityType` helps clients render appropriately.
 */
export interface SmartSpaceEventContext {
  /** The entity that produced this event (human or agent) */
  entityId?: string;
  /** The type of entity (for client-side rendering hints) */
  entityType?: 'human' | 'agent';
  /** If this event is part of an agent run */
  runId?: string;
  /** @deprecated Use entityId instead. Kept for backwards compatibility. */
  agentEntityId?: string;
}

export async function emitSmartSpaceEvent(
  smartSpaceId: string,
  type: string,
  data: Record<string, unknown>,
  context: SmartSpaceEventContext = {}
): Promise<{ id: string; seq: number; ts: string }> {
  const streamKey = `smartSpace:${smartSpaceId}:stream`;
  const notifyChannel = `smartSpace:${smartSpaceId}:notify`;
  const seqKey = `smartSpace:${smartSpaceId}:seq`;

  const seq = await redis.incr(seqKey);
  const ts = new Date().toISOString();

  // Build payload with all context information
  // This allows any subscriber to know who produced each event
  const payload = {
    seq,
    smartSpaceId,
    // Source entity information
    entityId: context.entityId || context.agentEntityId,
    entityType: context.entityType,
    // Run context (if from an agent execution)
    runId: context.runId,
    // Backwards compatibility
    agentEntityId: context.agentEntityId,
    // Event data
    data,
  };

  const id = await redis.xadd(streamKey, '*', 'type', type, 'ts', ts, 'payload', JSON.stringify(payload));
  if (!id) {
    throw new Error('Failed to write SmartSpace event to Redis stream');
  }

  await redis.publish(notifyChannel, JSON.stringify({ type, seq }));

  return { id, seq, ts };
}
