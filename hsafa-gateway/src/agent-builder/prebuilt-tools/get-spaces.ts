import { prisma } from '../../lib/db.js';
import { registerPrebuiltTool } from './registry.js';
import type { PrebuiltToolContext } from '../builder.js';

registerPrebuiltTool('getSpaces', {
  defaultDescription:
    'Get the list of SmartSpaces you belong to. ' +
    'Returns each space\'s ID, name, and member count. ' +
    'Use this to discover available spaces before using goToSpace.',

  inputSchema: {
    type: 'object',
    properties: {},
  },

  async execute(_input: unknown, context: PrebuiltToolContext) {
    const { agentEntityId, smartSpaceId: currentSmartSpaceId } = context;

    const memberships = await prisma.smartSpaceMembership.findMany({
      where: { entityId: agentEntityId },
      include: {
        smartSpace: {
          select: {
            id: true,
            name: true,
            _count: { select: { memberships: true } },
          },
        },
      },
    });

    const spaces = memberships.map((m) => ({
      id: m.smartSpace.id,
      name: m.smartSpace.name,
      memberCount: m.smartSpace._count.memberships,
      isCurrent: m.smartSpace.id === currentSmartSpaceId,
    }));

    return {
      currentSmartSpaceId,
      spaces,
      total: spaces.length,
    };
  },
});
