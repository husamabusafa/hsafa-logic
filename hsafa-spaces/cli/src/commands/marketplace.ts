// =============================================================================
// hsafa marketplace — search, install, publish (future)
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";

export function registerMarketplaceCommands(program: Command) {
  const marketplace = program
    .command("marketplace")
    .description("Browse and install community scopes (coming soon)");

  marketplace
    .command("search")
    .description("Search the scope marketplace")
    .argument("<query>", "Search query")
    .action((query: string) => {
      console.log(
        chalk.yellow(
          `Marketplace search for "${query}" is not yet available.\n` +
          "The marketplace is a planned feature — stay tuned!",
        ),
      );
    });

  marketplace
    .command("install")
    .description("Install a scope from the marketplace")
    .argument("<name>", "Scope name")
    .option("--config <pairs...>", "Config key=value pairs")
    .action((name: string) => {
      console.log(
        chalk.yellow(
          `Marketplace install for "${name}" is not yet available.\n` +
          "The marketplace is a planned feature — stay tuned!",
        ),
      );
    });

  marketplace
    .command("publish")
    .description("Publish a scope to the marketplace")
    .option("--description <text>", "Scope description")
    .option("--category <name>", "Category")
    .action(() => {
      console.log(
        chalk.yellow(
          "Marketplace publishing is not yet available.\n" +
          "The marketplace is a planned feature — stay tuned!",
        ),
      );
    });
}
