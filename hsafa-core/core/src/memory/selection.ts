import { getTopMemories, searchMemories } from './semantic.js';
import { getRecentEpisodes, searchEpisodes } from './episodic.js';
import { getAllSocialMemories } from './social.js';
import { searchProcedures } from './procedural.js';

// =============================================================================
// Memory Selection (v7)
//
// Per-run memory assembly. Builds a memory context string for the system prompt.
// Strategy: critical (top importance) + relevant (searched) + fill (recent).
// =============================================================================

export interface MemoryContext {
  semantic: string;
  episodic: string;
  social: string;
  procedural: string;
}

export interface SelectionOptions {
  haseefId: string;
  triggerType?: string;
  triggerData?: Record<string, unknown>;
}

/**
 * Assemble memory for a run's system prompt.
 * Combines all 4 memory types into formatted strings.
 */
export async function assembleMemory(opts: SelectionOptions): Promise<MemoryContext> {
  const { haseefId, triggerType, triggerData } = opts;

  // Extract search hints from trigger data
  const searchHint = extractSearchHint(triggerType, triggerData);

  // Parallel fetch all memory types
  const [semanticMems, episodes, socialMems, procedures] = await Promise.all([
    // Semantic: top importance + keyword search if hint available
    fetchSemanticMemory(haseefId, searchHint),
    // Episodic: recent + keyword search
    fetchEpisodicMemory(haseefId, searchHint),
    // Social: all known people
    getAllSocialMemories(haseefId),
    // Procedural: relevant patterns
    searchHint ? searchProcedures(haseefId, searchHint, 5) : Promise.resolve([]),
  ]);

  return {
    semantic: formatSemantic(semanticMems),
    episodic: formatEpisodic(episodes),
    social: formatSocial(socialMems),
    procedural: formatProcedural(procedures),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractSearchHint(
  triggerType?: string,
  triggerData?: Record<string, unknown>,
): string | undefined {
  if (!triggerData) return undefined;

  // Try to extract text from common event shapes
  const text = triggerData.text ?? triggerData.message ?? triggerData.subject ?? triggerData.query;
  if (typeof text === 'string' && text.length > 0) {
    // Take first 100 chars as search hint
    return text.slice(0, 100);
  }

  return triggerType;
}

async function fetchSemanticMemory(
  haseefId: string,
  searchHint?: string,
): Promise<Array<{ key: string; value: string; importance: number }>> {
  const topMems = await getTopMemories(haseefId, 20);

  if (!searchHint) return topMems;

  const searched = await searchMemories(haseefId, searchHint, 10);

  // Merge, dedup by key, top importance first
  const seen = new Set(topMems.map((m) => m.key));
  const merged = [...topMems];
  for (const m of searched) {
    if (!seen.has(m.key)) {
      merged.push(m);
      seen.add(m.key);
    }
  }
  return merged.sort((a, b) => b.importance - a.importance).slice(0, 30);
}

async function fetchEpisodicMemory(
  haseefId: string,
  searchHint?: string,
): Promise<Array<{ summary: string; context: unknown; createdAt: Date }>> {
  const recent = await getRecentEpisodes(haseefId, 5);

  if (!searchHint) return recent;

  const searched = await searchEpisodes(haseefId, searchHint, 5);

  // Merge, dedup by summary
  const seen = new Set(recent.map((e) => e.summary));
  const merged = [...recent];
  for (const e of searched) {
    if (!seen.has(e.summary)) {
      merged.push(e);
    }
  }
  return merged.slice(0, 10);
}

function formatSemantic(
  mems: Array<{ key: string; value: string; importance: number }>,
): string {
  if (mems.length === 0) return '';
  return mems.map((m) => `- ${m.key}: ${m.value}`).join('\n');
}

function formatEpisodic(
  episodes: Array<{ summary: string; createdAt: Date }>,
): string {
  if (episodes.length === 0) return '';
  return episodes
    .map((e) => `- [${e.createdAt.toISOString().split('T')[0]}] ${e.summary}`)
    .join('\n');
}

function formatSocial(
  mems: Array<{ entityName: string; observations: unknown; relationship: string | null }>,
): string {
  if (mems.length === 0) return '';
  return mems
    .map((m) => {
      const parts = [`- ${m.entityName}`];
      if (m.relationship) parts.push(`(${m.relationship})`);
      if (m.observations && typeof m.observations === 'object') {
        const obs = m.observations as Record<string, unknown>;
        const notes = Object.entries(obs)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ');
        if (notes) parts.push(`— ${notes}`);
      }
      return parts.join(' ');
    })
    .join('\n');
}

function formatProcedural(
  procs: Array<{ trigger: string; response: string; confidence: number }>,
): string {
  if (procs.length === 0) return '';
  return procs
    .map((p) => `- When: ${p.trigger} → Do: ${p.response}`)
    .join('\n');
}
