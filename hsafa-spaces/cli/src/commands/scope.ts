// =============================================================================
// hsafa scope — init, create, deploy, list, logs, start/stop/restart, delete,
//               attach, detach, instance create/delete
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import fs from "node:fs";
import path from "node:path";
import { requireAuth } from "../config.js";
import { ApiClient, ApiError } from "../api.js";
import type { ScopeInstance } from "../api.js";
import { scaffoldScope } from "../scaffold.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function makeApi(): ApiClient {
  const { token, serverUrl } = requireAuth();
  return new ApiClient(serverUrl, token);
}

async function resolveInstance(
  api: ApiClient,
  nameOrScope: string,
  instanceName?: string,
): Promise<ScopeInstance | null> {
  const { instances } = await api.listInstances();
  const target = instanceName || nameOrScope;
  return (
    instances.find(
      (i) =>
        i.scopeName === target ||
        i.name === target ||
        i.template?.slug === target,
    ) ?? null
  );
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

// ── Register ────────────────────────────────────────────────────────────────

export function registerScopeCommands(program: Command) {
  const scope = program.command("scope").description("Manage scopes");

  // ── init ──────────────────────────────────────────────────────────────────

  scope
    .command("init")
    .description("Scaffold a new scope project")
    .argument("<name>", "Scope name")
    .option("--lang <language>", "Language: typescript, javascript, python", "typescript")
    .option("--starter <template>", "Starter: blank, api, database, webhook", "blank")
    .action(async (name: string, opts: { lang: string; starter: string }) => {
      const dir = path.resolve(process.cwd(), name);
      if (fs.existsSync(dir)) {
        console.error(chalk.red(`Directory "${name}" already exists.`));
        process.exit(1);
      }

      const spinner = ora("Scaffolding project...").start();
      try {
        scaffoldScope(dir, name, opts.lang, opts.starter);
        spinner.succeed(chalk.green(`Created ${chalk.bold(name)}/`));
        console.log();
        console.log(chalk.dim("  Next steps:"));
        console.log(chalk.dim(`  cd ${name}`));
        console.log(chalk.dim("  npm install"));
        console.log(chalk.dim("  hsafa scope create " + name));
        console.log(chalk.dim("  npm run dev"));
      } catch (err: unknown) {
        spinner.fail(chalk.red(`Scaffold failed: ${err instanceof Error ? err.message : err}`));
      }
    });

  // ── create ────────────────────────────────────────────────────────────────

  scope
    .command("create")
    .description("Register a scope on the platform (no deploy)")
    .argument("<name>", "Scope name")
    .option("--deployment <type>", "Deployment type: platform, external", "platform")
    .action(async (name: string, opts: { deployment: string }) => {
      const api = makeApi();
      const spinner = ora("Creating scope...").start();

      try {
        if (opts.deployment === "external") {
          spinner.stop();

          const response = await prompts({
            type: "text",
            name: "scopeKey",
            message: "Scope key (hsk_scope_...)",
            validate: (v: string) =>
              v.startsWith("hsk_scope_") ? true : "Must start with hsk_scope_",
          });

          if (!response.scopeKey) {
            console.log(chalk.dim("Cancelled."));
            return;
          }

          spinner.start("Registering external scope...");
          const result = await api.registerExternalScope({
            scopeName: name,
            displayName: name,
            scopeKey: response.scopeKey,
          });

          spinner.succeed(chalk.green("Scope registered!"));
          console.log();
          console.log(`  ${chalk.bold("Template:")}  ${name} (external)`);
          console.log(`  ${chalk.bold("Instance:")}  ${result.instance.name}`);
          console.log(`  ${chalk.bold("Scope:")}     ${result.instance.scopeName}`);
          return;
        }

        // Platform — need a template. Try to find or prompt to deploy.
        const { templates } = await api.listTemplates();
        const template = templates.find((t) => t.slug === name);

        if (!template) {
          spinner.fail(
            chalk.yellow(
              `No template "${name}" found. For platform scopes, use: hsafa scope deploy`,
            ),
          );
          return;
        }

        const { instance } = await api.createInstance({
          templateId: template.id,
          name,
          scopeName: name,
          deploymentType: "platform",
        });

        spinner.succeed(chalk.green("Scope created!"));
        console.log();
        console.log(`  ${chalk.bold("Template:")}  ${name}`);
        console.log(`  ${chalk.bold("Instance:")}  ${instance.name} (default)`);
        console.log(`  ${chalk.bold("Scope:")}     ${instance.scopeName}`);
        if (instance.coreScopeKey) {
          console.log(`  ${chalk.bold("Scope Key:")} ${instance.coreScopeKey}`);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to create scope."));
        }
      }
    });

  // ── deploy ────────────────────────────────────────────────────────────────

  scope
    .command("deploy")
    .description("Build + deploy scope to the platform")
    .option("--image <url>", "Use existing Docker image (skip build)")
    .action(async (opts: { image?: string }) => {
      const api = makeApi();

      // Read scope metadata from current directory
      const cwd = process.cwd();
      const pkgPath = path.join(cwd, "package.json");
      const reqPath = path.join(cwd, "requirements.txt");
      const goModPath = path.join(cwd, "go.mod");

      let scopeName: string | undefined;
      let imageUrl = opts.image;

      // Detect language and read name
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        scopeName = pkg.hsafa?.scope || pkg.name?.replace(/^@.*\//, "");
      } else if (fs.existsSync(reqPath)) {
        scopeName = path.basename(cwd);
      } else if (fs.existsSync(goModPath)) {
        scopeName = path.basename(cwd);
      } else {
        console.error(chalk.red("No package.json, requirements.txt, or go.mod found."));
        console.error(chalk.dim("Run this command from your scope project directory."));
        process.exit(1);
      }

      if (!scopeName) {
        console.error(chalk.red("Could not determine scope name from project."));
        process.exit(1);
      }

      console.log(chalk.bold(`\nDeploying scope: ${scopeName}\n`));

      const spinner = ora("Looking for existing instance...").start();

      try {
        const { instances } = await api.listInstances();
        let instance = instances.find(
          (i) => i.scopeName === scopeName && !i.builtIn,
        );

        if (!instance) {
          // Find or prompt for template
          spinner.text = "Creating template + instance...";
          const { templates } = await api.listTemplates();
          const template = templates.find((t) => t.slug === scopeName);

          if (!template) {
            spinner.fail(
              chalk.red(
                `No template "${scopeName}" found. Create one first via the Spaces UI, or use --image with a prebuilt template.`,
              ),
            );
            return;
          }

          const created = await api.createInstance({
            templateId: template.id,
            name: scopeName!,
            scopeName: scopeName!,
            deploymentType: imageUrl ? "custom" : "platform",
            imageUrl: imageUrl || undefined,
            autoDeploy: true,
          });
          instance = created.instance;
        }

        if (imageUrl) {
          spinner.text = "Deploying with provided image...";
        } else {
          spinner.text = "Deploying container...";
        }

        await api.deployInstance(instance.id);

        spinner.succeed(chalk.green(`Deployed "${scopeName}"`));
        console.log();
        console.log(`  ${chalk.bold("Template:")}    ${instance.template?.slug || scopeName}`);
        console.log(`  ${chalk.bold("Instance:")}    ${instance.name}`);
        console.log(`  ${chalk.bold("Scope:")}       ${instance.scopeName}`);
        if (instance.coreScopeKey) {
          console.log(`  ${chalk.bold("Scope Key:")}  ${instance.coreScopeKey}`);
        }
        if (instance.imageUrl) {
          console.log(`  ${chalk.bold("Image:")}      ${instance.imageUrl}`);
        }
        console.log(`  ${chalk.bold("Status:")}     ${chalk.green("deploying")}`);
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Deploy failed."));
        }
      }
    });

  // ── list ──────────────────────────────────────────────────────────────────

  scope
    .command("list")
    .alias("ls")
    .description("List all scope instances")
    .action(async () => {
      const api = makeApi();
      const spinner = ora("Fetching scopes...").start();

      try {
        const { instances } = await api.listInstances();
        spinner.stop();

        if (instances.length === 0) {
          console.log(chalk.dim("No scopes found."));
          return;
        }

        // Table header
        console.log(
          chalk.bold(
            `${padRight("TEMPLATE", 16)} ${padRight("INSTANCE", 16)} ${padRight("STATUS", 12)} ${padRight("TYPE", 10)} ${padRight("CREATED", 10)}`,
          ),
        );
        console.log(chalk.dim("-".repeat(70)));

        for (const inst of instances) {
          const tpl = inst.template?.slug || inst.templateId || "-";
          const status = inst.containerStatus || (inst.connected ? "connected" : "unknown");
          const statusColor =
            status === "running" || inst.connected
              ? chalk.green
              : status === "stopped"
                ? chalk.yellow
                : chalk.dim;
          const type = inst.builtIn ? "built-in" : inst.deploymentType;
          const created = inst.createdAt ? formatTime(inst.createdAt) : "-";

          console.log(
            `${padRight(tpl, 16)} ${padRight(inst.name, 16)} ${statusColor(padRight(status, 12))} ${padRight(type, 10)} ${chalk.dim(padRight(created, 10))}`,
          );
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to list scopes."));
        }
      }
    });

  // ── logs ──────────────────────────────────────────────────────────────────

  scope
    .command("logs")
    .description("View container logs for a scope")
    .argument("<name>", "Scope or instance name")
    .option("--instance <name>", "Target a specific instance")
    .option("--tail <n>", "Number of lines", "200")
    .action(async (name: string, opts: { instance?: string; tail: string }) => {
      const api = makeApi();
      const spinner = ora("Fetching logs...").start();

      try {
        const inst = await resolveInstance(api, name, opts.instance);
        if (!inst) {
          spinner.fail(chalk.red(`Scope "${name}" not found.`));
          return;
        }

        const { logs } = await api.getLogs(inst.id, parseInt(opts.tail));
        spinner.stop();
        console.log(logs || chalk.dim("(no logs)"));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to get logs."));
        }
      }
    });

  // ── start / stop / restart ────────────────────────────────────────────────

  for (const action of ["start", "stop", "restart"] as const) {
    scope
      .command(action)
      .description(`${action.charAt(0).toUpperCase() + action.slice(1)} a scope container`)
      .argument("<name>", "Scope or instance name")
      .option("--instance <name>", "Target a specific instance")
      .action(async (name: string, opts: { instance?: string }) => {
        const api = makeApi();
        const spinner = ora(`${action}ing...`).start();

        try {
          const inst = await resolveInstance(api, name, opts.instance);
          if (!inst) {
            spinner.fail(chalk.red(`Scope "${name}" not found.`));
            return;
          }

          if (action === "start") await api.startInstance(inst.id);
          else if (action === "stop") await api.stopInstance(inst.id);
          else await api.restartInstance(inst.id);

          spinner.succeed(chalk.green(`${action}ed "${inst.scopeName}"`));
        } catch (err) {
          if (err instanceof ApiError) {
            spinner.fail(chalk.red(err.message));
          } else {
            spinner.fail(chalk.red(`Failed to ${action}.`));
          }
        }
      });
  }

  // ── delete ────────────────────────────────────────────────────────────────

  scope
    .command("delete")
    .description("Delete a scope template and all its instances")
    .argument("<name>", "Scope or instance name")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const api = makeApi();

      if (!opts.yes) {
        const confirm = await prompts({
          type: "confirm",
          name: "value",
          message: `Delete scope "${name}" and all its instances?`,
          initial: false,
        });
        if (!confirm.value) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      const spinner = ora("Deleting scope...").start();

      try {
        const inst = await resolveInstance(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Scope "${name}" not found.`));
          return;
        }

        await api.deleteInstance(inst.id);
        spinner.succeed(chalk.green(`Deleted "${name}"`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to delete scope."));
        }
      }
    });

  // ── attach ────────────────────────────────────────────────────────────────

  scope
    .command("attach")
    .description("Attach a scope to a haseef")
    .argument("<name>", "Scope or instance name")
    .requiredOption("--haseef <id>", "Haseef ID to attach to")
    .option("--instance <name>", "Target a specific instance")
    .action(async (name: string, opts: { haseef: string; instance?: string }) => {
      const api = makeApi();
      const spinner = ora("Attaching scope...").start();

      try {
        const inst = await resolveInstance(api, name, opts.instance);
        if (!inst) {
          spinner.fail(chalk.red(`Scope "${name}" not found.`));
          return;
        }

        await api.attachScope(opts.haseef, inst.id);
        spinner.succeed(chalk.green(`Attached "${inst.scopeName}" to haseef ${opts.haseef}`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to attach scope."));
        }
      }
    });

  // ── detach ────────────────────────────────────────────────────────────────

  scope
    .command("detach")
    .description("Detach a scope from a haseef")
    .argument("<name>", "Scope name")
    .requiredOption("--haseef <id>", "Haseef ID to detach from")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Detaching scope...").start();

      try {
        await api.detachScope(opts.haseef, name);
        spinner.succeed(chalk.green(`Detached "${name}" from haseef ${opts.haseef}`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to detach scope."));
        }
      }
    });

  // ── instance create ───────────────────────────────────────────────────────

  const instance = scope
    .command("instance")
    .description("Manage scope instances");

  instance
    .command("create")
    .description("Create a new instance of an existing template")
    .argument("<template>", "Template slug")
    .requiredOption("--name <name>", "Instance name")
    .option("--config <pairs...>", "Config key=value pairs")
    .action(
      async (
        templateSlug: string,
        opts: { name: string; config?: string[] },
      ) => {
        const api = makeApi();
        const spinner = ora("Creating instance...").start();

        try {
          const { templates } = await api.listTemplates();
          const template = templates.find((t) => t.slug === templateSlug);

          if (!template) {
            spinner.fail(chalk.red(`Template "${templateSlug}" not found.`));
            return;
          }

          const configs = (opts.config || []).map((pair) => {
            const eq = pair.indexOf("=");
            return {
              key: eq > 0 ? pair.slice(0, eq) : pair,
              value: eq > 0 ? pair.slice(eq + 1) : "",
              isSecret: false,
            };
          });

          const { instance: inst } = await api.createInstance({
            templateId: template.id,
            name: opts.name,
            configs: configs.length > 0 ? configs : undefined,
          });

          spinner.succeed(chalk.green(`Instance created!`));
          console.log();
          console.log(
            `  ${chalk.bold("Instance:")} ${inst.name} (from template: ${templateSlug})`,
          );
          console.log(`  ${chalk.bold("Scope:")}    ${inst.scopeName}`);
          if (inst.coreScopeKey) {
            console.log(`  ${chalk.bold("Scope Key:")} ${inst.coreScopeKey}`);
          }
        } catch (err) {
          if (err instanceof ApiError) {
            spinner.fail(chalk.red(err.message));
          } else {
            spinner.fail(chalk.red("Failed to create instance."));
          }
        }
      },
    );

  instance
    .command("delete")
    .description("Delete a specific scope instance")
    .argument("<name>", "Instance name")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const api = makeApi();

      if (!opts.yes) {
        const confirm = await prompts({
          type: "confirm",
          name: "value",
          message: `Delete instance "${name}"?`,
          initial: false,
        });
        if (!confirm.value) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      const spinner = ora("Deleting instance...").start();

      try {
        const inst = await resolveInstance(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Instance "${name}" not found.`));
          return;
        }

        await api.deleteInstance(inst.id);
        spinner.succeed(chalk.green(`Deleted instance "${name}"`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to delete instance."));
        }
      }
    });
}
