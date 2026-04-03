// =============================================================================
// Spaces Tools — Navigation (enter_space, get_messages, get_space_members)
// =============================================================================

import { prisma } from "../../db.js";
import { markOnline } from "../../smartspace-events.js";
import { state } from "../types.js";
import { getActiveSpaceId } from "./shared.js";

export async function handleEnterSpace(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  if (!conn) return { error: "Haseef not connected" };
  const agentEntityId = conn.agentEntityId;

  const spaceId = args.spaceId as string;
  if (!spaceId) return { error: "spaceId is required" };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(spaceId)) {
    return { error: `Invalid spaceId format: "${spaceId.slice(0, 60)}". Use a valid UUID from the event data.` };
  }

  // Verify membership
  const membership = await prisma.smartSpaceMembership.findUnique({
    where: { smartSpaceId_entityId: { smartSpaceId: spaceId, entityId: agentEntityId } },
  });
  if (!membership) return { error: `You are not a member of space ${spaceId}` };

  // Load space info + members
  const [space, memberships] = await Promise.all([
    prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { id: true, name: true, description: true } }),
    prisma.smartSpaceMembership.findMany({
      where: { smartSpaceId: spaceId },
      include: { entity: { select: { id: true, displayName: true, type: true } } },
    }),
  ]);

  if (!space) return { error: "Space not found" };

  // Set active space (both auto and explicit — explicit persists across cycles)
  conn.activeSpace = { spaceId: space.id, spaceName: space.name ?? spaceId };
  conn.enteredSpace = { spaceId: space.id, spaceName: space.name ?? spaceId };

  // Mark online in this space
  void markOnline(spaceId, agentEntityId);

  const members = memberships.map((m: any) => ({
    name: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
    type: m.entity?.type ?? "unknown",
    role: m.role,
    entityId: m.entityId,
    isYou: m.entityId === agentEntityId,
  }));

  return {
    success: true,
    currentSpace: {
      id: space.id,
      name: space.name,
      description: space.description,
    },
    members,
    message: `You are now in "${space.name}". All messages you send will go here.`,
  };
}

export async function handleGetMessages(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  // Optional spaceId override; defaults to active space
  let spaceId = args.spaceId as string | undefined;
  if (!spaceId) {
    const active = getActiveSpaceId(conn);
    if ('error' in active) return active;
    spaceId = active.spaceId;
  }
  const limit = (args.limit as number) || 20;

  const messages = await prisma.smartSpaceMessage.findMany({
    where: { smartSpaceId: spaceId },
    orderBy: { seq: "desc" },
    take: Math.min(limit, 100),
    include: {
      entity: {
        select: { id: true, displayName: true, type: true },
      },
    },
  });

  return {
    messages: messages.reverse().map((m: any) => {
      const meta = m.metadata as Record<string, unknown> | null;
      const msgType = (meta?.type as string) || "text";
      const result: Record<string, unknown> = {
        id: m.id,
        sender: m.entityId === agentEntityId ? "You" : (m.entity?.displayName ?? "Unknown"),
        senderType: m.entity?.type ?? "unknown",
        content: m.content,
        type: msgType,
        createdAt: m.createdAt.toISOString(),
      };
      if (meta?.audience) result.audience = meta.audience;
      if (meta?.status) result.status = meta.status;
      if (meta?.responseSummary) result.responseSummary = meta.responseSummary;
      if (meta?.replyTo) result.replyTo = meta.replyTo;
      if (meta?.payload) result.payload = meta.payload;
      return result;
    }),
  };
}

export async function handleGetSpaceMembers(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  // Optional spaceId override; defaults to active space
  let spaceId = args.spaceId as string | undefined;
  if (!spaceId) {
    const active = getActiveSpaceId(conn);
    if ('error' in active) return active;
    spaceId = active.spaceId;
  }

  const memberships = await prisma.smartSpaceMembership.findMany({
    where: { smartSpaceId: spaceId },
    include: {
      entity: { select: { id: true, displayName: true, type: true } },
    },
  });

  return {
    members: memberships.map((m: any) => ({
      entityId: m.entityId,
      name: m.entity?.displayName ?? "Unknown",
      type: m.entity?.type ?? "unknown",
      role: m.role,
      isYou: m.entityId === agentEntityId,
    })),
  };
}
