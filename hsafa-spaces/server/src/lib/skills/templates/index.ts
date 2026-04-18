// =============================================================================
// Skill Template Registry
//
// Central registry of all prebuilt skill templates.
// =============================================================================

import type { SkillTemplateDefinition } from "../types.js";
import { codeTemplate } from "./code.js";
import { databaseTemplate } from "./database.js";
import { emailTemplate } from "./email.js";
import { schedulerTemplate } from "./scheduler.js";
import { webTemplate } from "./web.js";

/** All prebuilt skill templates, keyed by template name */
export const ALL_TEMPLATES: Map<string, SkillTemplateDefinition> = new Map([
  [codeTemplate.name, codeTemplate],
  [databaseTemplate.name, databaseTemplate],
  [emailTemplate.name, emailTemplate],
  [schedulerTemplate.name, schedulerTemplate],
  [webTemplate.name, webTemplate],
]);

/** Get a template by name */
export function getTemplate(name: string): SkillTemplateDefinition | undefined {
  return ALL_TEMPLATES.get(name);
}

/** Get all templates as an array */
export function getAllTemplates(): SkillTemplateDefinition[] {
  return Array.from(ALL_TEMPLATES.values());
}
