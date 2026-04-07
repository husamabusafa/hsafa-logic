#!/usr/bin/env node
// =============================================================================
// @hsafa/cli — main entry point
// =============================================================================

import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerScopeCommands } from "./commands/scope.js";
import { registerMarketplaceCommands } from "./commands/marketplace.js";
import { registerConfigCommands } from "./commands/config.js";

const program = new Command();

program
  .name("hsafa")
  .description("Hsafa CLI — build, deploy, and manage scopes for your haseefs")
  .version("2.0.0");

registerConfigCommands(program);
registerAuthCommands(program);
registerScopeCommands(program);
registerMarketplaceCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
