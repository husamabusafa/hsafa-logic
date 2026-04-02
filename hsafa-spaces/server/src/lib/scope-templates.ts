// =============================================================================
// Scope Templates — Prebuilt plugin templates (installable scopes)
//
// NOTE: "spaces" is NOT a template — it's a built-in scope that always exists.
// Only installable plugins (scheduler, whatsapp, gmail, custom, etc.) live here.
//
// These are the prebuilt scope templates. They are synced to DB on bootstrap
// via ensurePrebuiltScopes(). Custom templates are created by developers.
// =============================================================================

import { SCHEDULER_TOOLS } from "./service/manifest.js";

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
 * Prebuilt scope templates — installable plugins defined in code.
 * IDs are stable UUIDs so instance templateId references stay consistent.
 *
 * "spaces" is NOT here — it's a built-in scope managed by scope-registry.ts.
 */
export const SCOPE_TEMPLATES: ScopeTemplate[] = [
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
    instructions: `You can create scheduled plans that trigger you as sense events.

HOW IT WORKS:
  Use scheduler_create_schedule to set up recurring or one-time schedules.
  When the time comes, you will receive a scheduled_plan sense event.
  Respond to these events like any other — use spaces tools to take action.`,
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
