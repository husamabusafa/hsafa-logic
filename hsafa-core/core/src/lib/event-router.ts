import { prisma } from './db.js';

// =============================================================================
// Event Router (v7)
//
// Resolves incoming events to the correct Haseef.
// Two routing modes:
//   1. Direct: event.haseefId — send to this specific haseef
//   2. Profile: event.target — find haseef by matching profile fields
// =============================================================================

export interface IncomingEvent {
  skill: string;
  type: string;
  data: Record<string, unknown>;
  attachments?: Attachment[];
  haseefId?: string;
  target?: Record<string, string>;
}

export interface Attachment {
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  url?: string;
  base64?: string;
  name?: string;
}

export interface RoutedEvent {
  haseefId: string;
  haseefName: string;
  skill: string;
  type: string;
  data: Record<string, unknown>;
  attachments?: Attachment[];
}

/**
 * Resolve an incoming event to a specific haseef.
 * Validates that the skill is active for the resolved haseef.
 */
export async function routeEvent(event: IncomingEvent): Promise<RoutedEvent | null> {
  let haseefId: string;
  let haseefName: string;
  let haseefSkills: string[];

  if (event.haseefId) {
    // Direct routing
    const haseef = await prisma.haseef.findUnique({
      where: { id: event.haseefId },
      select: { id: true, name: true, skills: true },
    });
    if (!haseef) {
      throw new EventRoutingError(`Haseef "${event.haseefId}" not found`);
    }
    haseefId = haseef.id;
    haseefName = haseef.name;
    haseefSkills = haseef.skills;
  } else if (event.target) {
    // Profile-based routing
    const haseef = await resolveByProfile(event.target);
    if (!haseef) {
      throw new EventRoutingError(
        `No haseef matches target: ${JSON.stringify(event.target)}`,
      );
    }
    haseefId = haseef.id;
    haseefName = haseef.name;
    haseefSkills = haseef.skills;
  } else {
    throw new EventRoutingError('Event must have either haseefId or target');
  }

  // Validate skill is active for this haseef
  if (!haseefSkills.includes(event.skill)) {
    console.warn(
      `[event-router] Skill "${event.skill}" not active for haseef "${haseefName}" (active: ${haseefSkills.join(', ')})`,
    );
    return null;
  }

  return {
    haseefId,
    haseefName,
    skill: event.skill,
    type: event.type,
    data: event.data,
    attachments: event.attachments,
  };
}

/**
 * Find a haseef by matching profile fields.
 * Iterates target key-value pairs and searches profileJson using Prisma JSON path queries.
 */
async function resolveByProfile(
  target: Record<string, string>,
): Promise<{ id: string; name: string; skills: string[] } | null> {
  for (const [key, value] of Object.entries(target)) {
    const haseef = await prisma.haseef.findFirst({
      where: {
        profileJson: { path: [key], equals: value },
      },
      select: { id: true, name: true, skills: true },
    });
    if (haseef) return haseef;
  }
  return null;
}

export class EventRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventRoutingError';
  }
}
