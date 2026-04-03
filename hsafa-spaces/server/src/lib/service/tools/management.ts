// =============================================================================
// Spaces Tools — Management (create_space, invite_to_space)
// =============================================================================

import { prisma } from "../../db.js";
import { markOnline } from "../../smartspace-events.js";
import { state } from "../types.js";
import { emitEntityChannelEvent } from "../sense-events.js";
import { getActiveSpaceId } from "./shared.js";

export async function handleInviteToSpace(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  const agentEntityId = conn?.agentEntityId;

  const active = getActiveSpaceId(conn);
  if ('error' in active) return active;
  const spaceId = active.spaceId;

  const email = args.email as string;
  if (!email) return { error: "email is required" };
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  // Check admin+ role
  const inviterMembership = await prisma.smartSpaceMembership.findFirst({
    where: { smartSpaceId: spaceId, entityId: agentEntityId },
  });
  if (!inviterMembership) return { error: "You are not a member of this space" };
  if (!["owner", "admin"].includes(inviterMembership.role))
    return { error: "You need admin or owner role to invite" };

  const invRole = (args.role as string) || "member";
  const invMessage = args.message as string | undefined;

  // Check if invitee is already a member (by email → entity lookup)
  const existingEntity = await prisma.entity.findUnique({
    where: { externalId: email },
    select: { id: true },
  });
  if (existingEntity) {
    const existingMembership = await prisma.smartSpaceMembership.findUnique({
      where: {
        smartSpaceId_entityId: {
          smartSpaceId: spaceId,
          entityId: existingEntity.id,
        },
      },
    });
    if (existingMembership)
      return { error: "This person is already a member of the space" };
  }

  // Upsert: if declined/expired/revoked, update back to pending
  const existing = await prisma.invitation.findUnique({
    where: { smartSpaceId_inviteeEmail: { smartSpaceId: spaceId, inviteeEmail: email } },
  });

  let invitation;
  if (existing) {
    if (existing.status === "pending")
      return { error: "There is already a pending invitation for this email" };
    if (existing.status === "accepted")
      return { error: "Invitation already accepted" };
    invitation = await prisma.invitation.update({
      where: { id: existing.id },
      data: {
        status: "pending",
        role: invRole,
        inviterId: agentEntityId,
        message: invMessage || null,
      },
    });
  } else {
    invitation = await prisma.invitation.create({
      data: {
        smartSpaceId: spaceId,
        inviterId: agentEntityId,
        inviteeEmail: email,
        inviteeId: existingEntity?.id || null,
        role: invRole,
        message: invMessage || null,
        status: "pending",
      },
    });
  }

  // Notify invitee via entity channel (if they have an account)
  if (existingEntity) {
    const [space, inviter] = await Promise.all([
      prisma.smartSpace.findUnique({ where: { id: spaceId }, select: { name: true } }),
      prisma.entity.findUnique({ where: { id: agentEntityId }, select: { displayName: true } }),
    ]);
    emitEntityChannelEvent(existingEntity.id, {
      type: "invitation.created",
      invitationId: invitation.id,
      smartSpaceId: spaceId,
      spaceName: space?.name,
      inviterName: inviter?.displayName,
      role: invRole,
      message: invMessage || null,
    }).catch(() => {});
  }

  return {
    success: true,
    invitationId: invitation.id,
    message: `Invitation sent to ${email}`,
  };
}

export async function handleCreateSpace(
  args: Record<string, unknown>,
  haseefId: string,
): Promise<unknown> {
  const conn = state.connections.get(haseefId);
  if (!conn) return { error: "Haseef not connected" };
  const agentEntityId = conn.agentEntityId;
  if (!agentEntityId) return { error: "agentEntityId not resolved" };

  const memberEntityIds = args.memberEntityIds as string[];
  if (!Array.isArray(memberEntityIds) || memberEntityIds.length === 0) {
    return { error: "memberEntityIds is required (array of entity IDs)" };
  }

  const spaceName = args.name as string | undefined;
  const spaceDescription = args.description as string | undefined;

  // Verify all members share a base with this haseef
  const haseefBases = await prisma.baseMember.findMany({
    where: { entityId: agentEntityId },
    select: { baseId: true },
  });
  const haseefBaseIds = haseefBases.map((b) => b.baseId);

  if (haseefBaseIds.length === 0) {
    return { error: "You are not in any base. Cannot create a space." };
  }

  for (const memberId of memberEntityIds) {
    const shared = await prisma.baseMember.findFirst({
      where: { entityId: memberId, baseId: { in: haseefBaseIds } },
    });
    if (!shared) {
      return { error: `Entity ${memberId} is not in any of your bases. You can only create spaces with base members.` };
    }
  }

  // Resolve display names for auto-naming
  const allMemberIds = [agentEntityId, ...memberEntityIds.filter((id) => id !== agentEntityId)];
  const entities = await prisma.entity.findMany({
    where: { id: { in: allMemberIds } },
    select: { id: true, displayName: true, type: true },
  });
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const isGroup = memberEntityIds.length > 1;
  const autoName = spaceName || (
    isGroup
      ? allMemberIds.map((id) => entityMap.get(id)?.displayName ?? "Unknown").join(", ")
      : entityMap.get(memberEntityIds[0])?.displayName ?? "Direct Chat"
  );

  const space = await prisma.smartSpace.create({
    data: {
      name: autoName,
      description: spaceDescription ?? null,
      metadata: isGroup ? {} : { isDirect: true },
    },
  });

  const membershipData = allMemberIds.map((entityId) => ({
    smartSpaceId: space.id,
    entityId,
    role: entityId === agentEntityId ? "admin" : "member",
  }));

  await prisma.smartSpaceMembership.createMany({ data: membershipData });

  // Set as active space
  conn.activeSpace = { spaceId: space.id, spaceName: autoName };
  conn.enteredSpace = { spaceId: space.id, spaceName: autoName };

  void markOnline(space.id, agentEntityId);

  const members = allMemberIds.map((id) => ({
    entityId: id,
    name: entityMap.get(id)?.displayName ?? "Unknown",
    type: entityMap.get(id)?.type ?? "unknown",
    isYou: id === agentEntityId,
  }));

  console.log(`[spaces-service] [${conn.haseefName}] Created space "${autoName}" with ${allMemberIds.length} members`);

  return {
    success: true,
    space: {
      id: space.id,
      name: autoName,
      description: spaceDescription ?? null,
      isGroup,
    },
    members,
    message: `Space "${autoName}" created. You are now in this space — send a message to start the conversation.`,
  };
}
