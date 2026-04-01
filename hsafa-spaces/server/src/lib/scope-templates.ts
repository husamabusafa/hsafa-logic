// =============================================================================
// Scope Templates — Hardcoded in code, always available
//
// These are the prebuilt scope templates. They are NEVER stored in the DB.
// The templates API serves them directly from here.
// =============================================================================

import { TOOLS, SCOPE_INSTRUCTIONS, SCHEDULER_TOOLS } from "./service/manifest.js";

export interface ScopeTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: "prebuilt" | "custom";
  configSchema: Record<string, unknown>;
  requiredProfileFields: string[];
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  instructions: string | null;
  published: boolean;
}

/**
 * Prebuilt scope templates — always available, defined in code.
 * IDs are stable UUIDs so instance templateId references stay consistent.
 */
export const SCOPE_TEMPLATES: ScopeTemplate[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "spaces",
    name: "Spaces",
    description: "Chat in smart spaces — send messages, images, voice, forms, polls, and more.",
    icon: "MessageSquare",
    category: "prebuilt",
    configSchema: {},
    requiredProfileFields: [],
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    instructions: SCOPE_INSTRUCTIONS,
    published: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    slug: "scheduler",
    name: "Scheduler",
    description: "Set recurring schedules and one-time reminders with cron expressions.",
    icon: "Calendar",
    category: "prebuilt",
    configSchema: {},
    requiredProfileFields: [],
    tools: SCHEDULER_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    instructions: null,
    published: true,
  },
];

/** Look up a template by ID */
export function getTemplateById(id: string): ScopeTemplate | undefined {
  return SCOPE_TEMPLATES.find((t) => t.id === id);
}

/** Look up a template by slug */
export function getTemplateBySlug(slug: string): ScopeTemplate | undefined {
  return SCOPE_TEMPLATES.find((t) => t.slug === slug);
}
