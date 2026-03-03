import { prisma } from './db.js';

// =============================================================================
// Identity Engine (v4 — Phase 5)
//
// Computes identity-related analytics for the system prompt. This module
// answers three meta-questions the Haseef's prompt needs:
//
//   1. How developed is my self-model? (completeness + gaps)
//   2. How well do I know each person? (relationship depth)
//   3. How am I growing over time? (trajectory)
//
// All functions are pure computations over DB data — no side effects.
// The prompt builder calls these to inject rich identity context.
// =============================================================================

// =============================================================================
// Self-Model Analysis
// =============================================================================

/**
 * The canonical self-model dimensions a Haseef can develop.
 * Each has a key prefix (self:*) and a human-readable label.
 */
export const SELF_DIMENSIONS = [
  { key: 'self:identity', label: 'identity', question: 'Who am I at my core?' },
  { key: 'self:values', label: 'values', question: 'What do I care about most deeply?' },
  { key: 'self:capabilities', label: 'capabilities', question: 'What am I good at? What can I do?' },
  { key: 'self:personality', label: 'personality', question: 'How do I communicate and relate to others?' },
  { key: 'self:limitations', label: 'limitations', question: 'What are my honest limitations?' },
  { key: 'self:purpose', label: 'purpose', question: 'What am I here to do? What drives me?' },
  { key: 'self:growth', label: 'growth', question: 'How have I changed? What have I learned about myself?' },
] as const;

export interface SelfModelAnalysis {
  /** Developed self-aspects (key → value) */
  developed: Array<{ key: string; label: string; value: string }>;
  /** Undeveloped self-aspects (key → guiding question) */
  gaps: Array<{ key: string; label: string; question: string }>;
  /** 0–1 score of how complete the self-model is */
  completeness: number;
  /** Any extra self:* memories beyond the canonical dimensions */
  extended: Array<{ key: string; value: string }>;
}

/**
 * Analyze the Haseef's self-model from its self:* memories.
 */
export function analyzeSelfModel(
  memories: Array<{ key: string; value: string }>,
): SelfModelAnalysis {
  const selfMemories = memories.filter((m) => m.key.startsWith('self:'));
  const selfMap = new Map(selfMemories.map((m) => [m.key, m.value]));

  const developed: SelfModelAnalysis['developed'] = [];
  const gaps: SelfModelAnalysis['gaps'] = [];
  const canonicalKeys = new Set<string>(SELF_DIMENSIONS.map((d) => d.key));

  for (const dim of SELF_DIMENSIONS) {
    const value = selfMap.get(dim.key);
    if (value) {
      developed.push({ key: dim.key, label: dim.label, value });
    } else {
      gaps.push({ key: dim.key, label: dim.label, question: dim.question });
    }
  }

  // Collect extended self-memories (custom dimensions the Haseef created itself)
  const extended = selfMemories
    .filter((m) => !canonicalKeys.has(m.key))
    .map((m) => ({ key: m.key, value: m.value }));

  const total = SELF_DIMENSIONS.length;
  const completeness = total > 0 ? developed.length / total : 0;

  return { developed, gaps, completeness, extended };
}

// =============================================================================
// Theory of Mind — Relationship Depth
// =============================================================================

/**
 * Relationship depth tiers based on memory richness.
 *
 *   acquaintance  — just a name or single fact
 *   familiar      — several facts, some preferences known
 *   understood    — deep model: values, patterns, emotional tendencies
 */
export type RelationshipDepth = 'acquaintance' | 'familiar' | 'understood';

export interface PersonModel {
  /** Person name (extracted from key) */
  name: string;
  /** The full memory value */
  model: string;
  /** Computed depth tier */
  depth: RelationshipDepth;
  /** Approximate word count of the model (proxy for richness) */
  wordCount: number;
}

/**
 * Analyze person models from person-model:* and about:* memories.
 */
export function analyzePersonModels(
  memories: Array<{ key: string; value: string }>,
): PersonModel[] {
  const personMemories = memories.filter(
    (m) => m.key.startsWith('person-model:') || m.key.startsWith('about:'),
  );

  return personMemories.map((m) => {
    const name = m.key.startsWith('person-model:')
      ? m.key.replace('person-model:', '')
      : m.key.replace('about:', '');

    const wordCount = m.value.split(/\s+/).length;

    let depth: RelationshipDepth;
    if (wordCount >= 50) {
      depth = 'understood';
    } else if (wordCount >= 15) {
      depth = 'familiar';
    } else {
      depth = 'acquaintance';
    }

    return { name, model: m.value, depth, wordCount };
  });
}

// =============================================================================
// Growth Trajectory
// =============================================================================

export interface GrowthTrajectory {
  /** Total think cycles completed */
  cycleCount: number;
  /** When the Haseef last processed a cycle */
  lastCycleAt: Date | null;
  /** When the Haseef was "born" (first consciousness record) */
  bornAt: Date | null;
  /** Total memories stored */
  totalMemories: number;
  /** Total self:* memories */
  selfMemoryCount: number;
  /** Total person-model memories */
  personModelCount: number;
  /** Total active goals */
  activeGoals: number;
  /** Total pending plans */
  pendingPlans: number;
  /** Human-readable age */
  age: string;
}

/**
 * Compute growth trajectory from DB data.
 */
export async function computeGrowthTrajectory(
  haseefEntityId: string,
): Promise<GrowthTrajectory> {
  const [consciousness, memoryCounts, goalCount, planCount] = await Promise.all([
    prisma.haseefConsciousness.findUnique({
      where: { haseefEntityId },
      select: { cycleCount: true, lastCycleAt: true, createdAt: true },
    }),
    prisma.memory.findMany({
      where: { entityId: haseefEntityId },
      select: { key: true },
    }),
    prisma.goal.count({
      where: { entityId: haseefEntityId, status: 'active' },
    }),
    prisma.plan.count({
      where: { entityId: haseefEntityId, status: 'pending' },
    }),
  ]);

  const selfMemoryCount = memoryCounts.filter((m: { key: string }) => m.key.startsWith('self:')).length;
  const personModelCount = memoryCounts.filter(
    (m: { key: string }) => m.key.startsWith('person-model:') || m.key.startsWith('about:'),
  ).length;

  const bornAt = consciousness?.createdAt ?? null;
  const age = bornAt ? formatAge(bornAt) : 'newborn';

  return {
    cycleCount: consciousness?.cycleCount ?? 0,
    lastCycleAt: consciousness?.lastCycleAt ?? null,
    bornAt,
    totalMemories: memoryCounts.length,
    selfMemoryCount,
    personModelCount,
    activeGoals: goalCount,
    pendingPlans: planCount,
    age,
  };
}

// =============================================================================
// Will Analysis — Goal-Value Alignment
// =============================================================================

export interface WillAnalysis {
  /** Active goals */
  active: Array<{ description: string; status: string; priority: number }>;
  /** Recently completed goals (for satisfaction/trajectory awareness) */
  completed: Array<{ description: string }>;
  /** Whether the Haseef has stated values to align goals against */
  hasValues: boolean;
  /** Whether there are goals but no values (suggests the Haseef should reflect) */
  goalsWithoutValues: boolean;
}

export async function analyzeWill(
  haseefEntityId: string,
  memories: Array<{ key: string; value: string }>,
): Promise<WillAnalysis> {
  const [activeGoals, completedGoals] = await Promise.all([
    prisma.goal.findMany({
      where: { entityId: haseefEntityId, status: 'active' },
      select: { description: true, status: true, priority: true },
      orderBy: { priority: 'desc' },
    }),
    prisma.goal.findMany({
      where: { entityId: haseefEntityId, status: 'completed' },
      select: { description: true },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ]);

  const hasValues = memories.some((m) => m.key === 'self:values');
  const goalsWithoutValues = activeGoals.length > 0 && !hasValues;

  return {
    active: activeGoals,
    completed: completedGoals,
    hasValues,
    goalsWithoutValues,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function formatAge(bornAt: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - bornAt.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} old`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} old`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} old`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} old`;
  return 'newborn';
}
