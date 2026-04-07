// =============================================================================
// hsafa config — manage CLI configuration (server URL, frontend URL, etc.)
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig, clearAuth } from "../config.js";

export function registerConfigCommands(program: Command) {
  const config = program
    .command("config")
    .description("Manage CLI configuration");

  // ── set-server ────────────────────────────────────────────────────────────

  config
    .command("set-server")
    .description("Set the server URL for all CLI commands")
    .argument("<url>", "Server URL (e.g. https://spaces.hsafa.com)")
    .option("--frontend <url>", "Frontend URL if different from server (e.g. http://localhost:5180)")
    .action((url: string, opts: { frontend?: string }) => {
      const cfg = loadConfig();
      const serverUrl = url.replace(/\/$/, "");
      const frontendUrl = opts.frontend
        ? opts.frontend.replace(/\/$/, "")
        : serverUrl;

      cfg.serverUrl = serverUrl;
      cfg.frontendUrl = frontendUrl;
      cfg.token = null;
      cfg.user = null;
      saveConfig(cfg);

      console.log(chalk.green(`Server:   ${cfg.serverUrl}`));
      if (cfg.frontendUrl !== cfg.serverUrl) {
        console.log(chalk.green(`Frontend: ${cfg.frontendUrl}`));
      }
      console.log(chalk.dim("Credentials cleared — run: hsafa auth login"));
    });

  // ── show ───────────────────────────────────────────────────────────────────

  config
    .command("show")
    .description("Show current CLI configuration")
    .action(() => {
      const cfg = loadConfig();
      console.log(chalk.bold("Hsafa CLI Config\n"));
      console.log(`  ${chalk.bold("Server:")}   ${cfg.serverUrl}`);
      console.log(`  ${chalk.bold("Frontend:")} ${cfg.frontendUrl}`);
      console.log(
        `  ${chalk.bold("Auth:")}     ${cfg.token ? chalk.green("logged in") : chalk.dim("not logged in")}`,
      );
      if (cfg.user) {
        console.log(`  ${chalk.bold("User:")}     ${cfg.user.name} (${cfg.user.email})`);
      }
    });

  // ── reset ──────────────────────────────────────────────────────────────────

  config
    .command("reset")
    .description("Reset CLI configuration to defaults")
    .action(() => {
      clearAuth();
      const cfg = loadConfig();
      cfg.serverUrl = "https://spaces.hsafa.com";
      cfg.frontendUrl = "https://spaces.hsafa.com";
      saveConfig(cfg);
      console.log(chalk.green("Configuration reset to defaults."));
    });
}
