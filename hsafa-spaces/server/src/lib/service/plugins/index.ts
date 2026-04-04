// =============================================================================
// Plugin Registry — All scope plugins in one place
//
// To add a new scope:
//   1. Create scope-templates/<name>/ with tools.ts, service.ts, index.ts
//   2. Export a ScopePlugin from index.ts
//   3. Import it here and add to ALL_PLUGINS
//   4. Done. The scope-registry handles the rest.
// =============================================================================

import type { ScopePlugin } from "../scope-plugin.js";
import { spacesPlugin } from "./spaces-plugin.js";

/**
 * All registered scope plugins. Only "spaces" is built-in.
 * All other scopes (postgres, scheduler, etc.) are deployed as
 * standalone Docker containers via the unified instance model.
 */
export const ALL_PLUGINS: ScopePlugin[] = [
  spacesPlugin,
];
