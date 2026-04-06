// =============================================================================
// Scope Templates — Prebuilt plugin templates (installable scopes)
//
// NOTE: "spaces" is NOT a template — it's a built-in scope that always exists.
// Only installable plugins (scheduler, whatsapp, gmail, custom, etc.) live here.
//
// To add a new scope template:
//   1. Create a folder: scope-templates/<name>/
//   2. Define tools.ts, handler.ts, and any service files
//   3. Export from <name>/index.ts
//   4. Add the template definition to SCOPE_TEMPLATES below
// =============================================================================

import { SCHEDULER_TOOLS, SCHEDULER_INSTRUCTIONS } from "./scheduler/index.js";
import { POSTGRES_TOOLS, POSTGRES_INSTRUCTIONS } from "./postgres/index.js";

export interface ScopeTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: "prebuilt" | "custom";
  defaultEnv: Array<{ key: string; value: string; isSecret: boolean }>;
  requiredProfileFields: string[];
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  instructions: string | null;
  imageUrl: string | null;
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
    imageUrl: "hsafa/scope-scheduler:latest",
    defaultEnv: [],
    requiredProfileFields: [],
    tools: SCHEDULER_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    instructions: SCHEDULER_INSTRUCTIONS,
    published: true,
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    slug: "postgres",
    name: "PostgreSQL",
    description: "Query databases, inspect schemas, and set up reactive watches with Postgres triggers.",
    icon: "Database",
    category: "prebuilt",
    imageUrl: "hsafa/scope-postgres:latest",
    defaultEnv: [
      { key: "connectionString", value: "", isSecret: true },
      { key: "schema", value: "public", isSecret: false },
      { key: "readOnly", value: "true", isSecret: false },
      { key: "maxRows", value: "100", isSecret: false },
      { key: "queryTimeoutMs", value: "10000", isSecret: false },
      { key: "maxWatches", value: "10", isSecret: false },
    ],
    requiredProfileFields: [],
    tools: POSTGRES_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    instructions: POSTGRES_INSTRUCTIONS,
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
