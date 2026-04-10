#!/usr/bin/env node
// =============================================================================
// @hsafa/cli — main entry point
// =============================================================================

import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerSkillCommands } from "./commands/scope.js";
import { registerConfigCommands } from "./commands/config.js";

const program = new Command();

program
  .name("hsafa")
  .description("Hsafa CLI — build and manage skills for your haseefs")
  .version("3.0.0");

registerConfigCommands(program);
registerAuthCommands(program);
registerSkillCommands(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
