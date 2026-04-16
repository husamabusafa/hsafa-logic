// =============================================================================
// Skill Template Registry
//
// Central registry of all prebuilt skill templates.
// =============================================================================

import type { SkillTemplateDefinition } from "../types.js";
import { databaseTemplate } from "./database.js";
import { schedulerTemplate } from "./scheduler.js";

/** All prebuilt skill templates, keyed by template name */
export const ALL_TEMPLATES: Map<string, SkillTemplateDefinition> = new Map([
  [databaseTemplate.name, databaseTemplate],
  [schedulerTemplate.name, schedulerTemplate],
]);

/** Get a template by name */
export function getTemplate(name: string): SkillTemplateDefinition | undefined {
  return ALL_TEMPLATES.get(name);
}

/** Get all templates as an array */
export function getAllTemplates(): SkillTemplateDefinition[] {
  return Array.from(ALL_TEMPLATES.values());
}
