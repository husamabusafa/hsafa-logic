import { tool, jsonSchema } from 'ai';
import { searchMemories } from '../memory/semantic.js';
import { searchEpisodes } from '../memory/episodic.js';

// =============================================================================
// recall_memories — Search memories + episodic history (v7 prebuilt tool)
// =============================================================================

export function buildRecallMemoriesTool(haseefId: string) {
  return (tool as any)({
    description: 'Search your memories and past run history for information. Returns matching semantic memories and relevant episodic summaries.',
    inputSchema: jsonSchema<{ query: string; limit?: number }>({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for' },
        limit: { type: 'number', description: 'Max results per type (default 10)' },
      },
      required: ['query'],
    }),
    execute: async ({ query, limit }: { query: string; limit?: number }) => {
      const max = limit ?? 10;
      const [memories, episodes] = await Promise.all([
        searchMemories(haseefId, query, max),
        searchEpisodes(haseefId, query, max),
      ]);

      return {
        memories: memories.map((m) => ({ key: m.key, value: m.value, importance: m.importance })),
        episodes: episodes.map((e) => ({ summary: e.summary, date: e.createdAt.toISOString().split('T')[0] })),
      };
    },
  });
}
