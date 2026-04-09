// =============================================================================
// hsafa scope — init, create, dev, deploy, register, list, logs,
//               start/stop/restart, delete, attach, detach, instance
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import prompts from "prompts";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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

async function resolveHaseefId(api: ApiClient, nameOrId: string): Promise<{ id: string; name: string }> {
  const { haseef } = await api.resolveHaseef(nameOrId);
  return haseef;
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

/** Read scope name from package.json in a directory */
function readScopeNameFromDir(dir: string): string | null {
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return pkg.hsafa?.scope || pkg.name?.replace(/^@.*\//, "") || null;
    } catch { return null; }
  }
  const reqPath = path.join(dir, "requirements.txt");
  if (fs.existsSync(reqPath)) return path.basename(dir);
  return null;
}

/** Write or update .env file with scope vars */
function writeEnvFile(dir: string, scopeName: string, scopeKey: string, coreUrl: string): void {
  const envPath = path.join(dir, ".env");
  const vars: Record<string, string> = {
    SCOPE_NAME: scopeName,
    SCOPE_KEY: scopeKey,
    CORE_URL: coreUrl,
  };

  if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, "utf-8");
    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`^${key}=.*$`, "m");
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`);
      } else {
        content = content.trimEnd() + `\n${key}=${value}\n`;
      }
    }
    fs.writeFileSync(envPath, content);
  } else {
    const content = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
    fs.writeFileSync(envPath, content);
  }
}

/** Quick-create scope + write .env + optionally attach to haseef */
async function quickSetup(
  api: ApiClient,
  scopeName: string,
  dir: string,
  haseefNameOrId?: string,
): Promise<{ scopeKey: string; coreUrl: string; instanceId: string } | null> {
  const spinner = ora("Registering scope...").start();

  try {
    const result = await api.quickCreateScope({ scopeName });
    spinner.succeed(
      result.alreadyExisted
        ? chalk.green(`Scope "${scopeName}" already exists — key refreshed`)
        : chalk.green(`Scope "${scopeName}" registered`),
    );

    // Write .env
    writeEnvFile(dir, scopeName, result.scopeKey, result.coreUrl);
    console.log(chalk.dim(`  .env written (SCOPE_NAME, SCOPE_KEY, CORE_URL)`));

    // Attach to haseef if requested
    if (haseefNameOrId) {
      const attachSpinner = ora(`Attaching to haseef "${haseefNameOrId}"...`).start();
      try {
        const haseef = await resolveHaseefId(api, haseefNameOrId);
        await api.attachScope(haseef.id, result.instance.id);
        attachSpinner.succeed(chalk.green(`Attached to ${haseef.name}`));
      } catch (err) {
        attachSpinner.fail(
          chalk.yellow(`Could not attach: ${err instanceof ApiError ? err.message : "unknown error"}`),
        );
      }
    }

    return {
      scopeKey: result.scopeKey,
      coreUrl: result.coreUrl,
      instanceId: result.instance.id,
    };
  } catch (err) {
    spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to register scope."));
    return null;
  }
}

// ── Register ────────────────────────────────────────────────────────────────

export function registerScopeCommands(program: Command) {
  const scope = program.command("scope").description("Manage scopes");

  // ── init ──────────────────────────────────────────────────────────────────

  scope
    .command("init")
    .description("Scaffold + register + configure a new scope")
    .argument("<name>", "Scope name")
    .option("--lang <language>", "Language: typescript, javascript, python", "typescript")
    .option("--starter <template>", "Starter: blank, api, database, webhook", "blank")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .action(async (name: string, opts: { lang: string; starter: string; haseef?: string }) => {
      const dir = path.resolve(process.cwd(), name);
      if (fs.existsSync(dir)) {
        console.error(chalk.red(`Directory "${name}" already exists.`));
        process.exit(1);
      }

      // 1. Scaffold
      const spinner = ora("Scaffolding project...").start();
      try {
        scaffoldScope(dir, name, opts.lang, opts.starter);
        spinner.succeed(chalk.green(`Created ${chalk.bold(name)}/`));
      } catch (err: unknown) {
        spinner.fail(chalk.red(`Scaffold failed: ${err instanceof Error ? err.message : err}`));
        return;
      }

      // 2. Register + provision key + write .env + attach
      const api = makeApi();
      const setup = await quickSetup(api, name, dir, opts.haseef);

      // 3. Print next steps
      console.log();
      if (setup) {
        console.log(chalk.dim("  Next:"));
        console.log(chalk.dim(`  cd ${name}`));
        console.log(chalk.dim("  npm install"));
        console.log(chalk.dim("  npm run dev"));
      } else {
        console.log(chalk.dim("  Next:"));
        console.log(chalk.dim(`  cd ${name}`));
        console.log(chalk.dim("  npm install"));
        console.log(chalk.dim("  hsafa scope create"));
        console.log(chalk.dim("  npm run dev"));
      }
    });

  // ── create ────────────────────────────────────────────────────────────────

  scope
    .command("create")
    .description("Register an existing project as a scope")
    .option("--name <name>", "Scope name (reads from package.json if omitted)")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .action(async (opts: { name?: string; haseef?: string }) => {
      const cwd = process.cwd();
      const scopeName = opts.name || readScopeNameFromDir(cwd);

      if (!scopeName) {
        console.error(chalk.red("Could not determine scope name."));
        console.error(chalk.dim("Run from a project directory with package.json, or use --name."));
        process.exit(1);
      }

      const api = makeApi();
      await quickSetup(api, scopeName, cwd, opts.haseef);
    });

  // ── dev ────────────────────────────────────────────────────────────────────

  scope
    .command("dev")
    .description("Auto-create scope if needed + start dev server")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .option("--port <port>", "Port for webhook scopes")
    .action(async (opts: { haseef?: string; port?: string }) => {
      const cwd = process.cwd();
      const scopeName = readScopeNameFromDir(cwd);

      if (!scopeName) {
        console.error(chalk.red("Could not determine scope name."));
        console.error(chalk.dim("Run from a scope project directory."));
        process.exit(1);
      }

      // Check if .env has SCOPE_KEY
      const envPath = path.join(cwd, ".env");
      let needsSetup = true;
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        if (/^SCOPE_KEY=hsk_scope_/m.test(content)) {
          needsSetup = false;
        }
      }

      if (needsSetup) {
        const api = makeApi();
        const setup = await quickSetup(api, scopeName, cwd, opts.haseef);
        if (!setup) {
          console.error(chalk.red("Setup failed. Cannot start dev server."));
          process.exit(1);
        }
      } else if (opts.haseef) {
        // Already set up, but user wants to attach
        const api = makeApi();
        const inst = await resolveInstance(api, scopeName);
        if (inst) {
          try {
            const haseef = await resolveHaseefId(api, opts.haseef);
            await api.attachScope(haseef.id, inst.id);
            console.log(chalk.green(`Attached to ${haseef.name}`));
          } catch (err) {
            console.log(chalk.yellow(`Could not attach: ${err instanceof ApiError ? err.message : "unknown error"}`));
          }
        }
      }

      // Start dev server
      console.log();
      console.log(chalk.bold(`Starting dev server for ${scopeName}...`));
      console.log();

      const pkgPath = path.join(cwd, "package.json");
      const reqPath = path.join(cwd, "requirements.txt");

      let cmd: string;
      let args: string[];

      if (fs.existsSync(pkgPath)) {
        cmd = "npx";
        args = ["tsx", "watch", "src/index.ts"];
      } else if (fs.existsSync(reqPath)) {
        cmd = "python3";
        args = ["main.py"];
      } else {
        console.error(chalk.red("Cannot detect project type."));
        process.exit(1);
      }

      const child = spawn(cmd, args, {
        cwd,
        stdio: "inherit",
        env: { ...process.env, ...(opts.port ? { PORT: opts.port } : {}) },
      });

      child.on("exit", (code) => process.exit(code ?? 0));
      process.on("SIGINT", () => child.kill("SIGINT"));
      process.on("SIGTERM", () => child.kill("SIGTERM"));
    });

  // ── register (external scope with existing key) ────────────────────────────

  scope
    .command("register")
    .description("Register a self-hosted scope that already has a key")
    .requiredOption("--key <scopeKey>", "Scope key (hsk_scope_...)")
    .requiredOption("--name <name>", "Scope name")
    .option("--description <desc>", "Description")
    .action(async (opts: { key: string; name: string; description?: string }) => {
      if (!opts.key.startsWith("hsk_scope_")) {
        console.error(chalk.red("Scope key must start with hsk_scope_"));
        process.exit(1);
      }

      const api = makeApi();
      const spinner = ora("Registering external scope...").start();

      try {
        const result = await api.registerExternalScope({
          scopeName: opts.name,
          displayName: opts.name,
          scopeKey: opts.key,
          description: opts.description,
        });

        spinner.succeed(chalk.green("Scope registered!"));
        console.log();
        console.log(`  ${chalk.bold("Scope:")}     ${result.instance.scopeName}`);
        console.log(`  ${chalk.bold("Instance:")}  ${result.instance.name}`);
        console.log(`  ${chalk.bold("Type:")}      external`);
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to register scope."));
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
        console.log(`  ${chalk.bold("Scope:")}       ${instance.scopeName}`);
        console.log(`  ${chalk.bold("Instance:")}    ${instance.name}`);
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
            `${padRight("SCOPE", 16)} ${padRight("NAME", 16)} ${padRight("STATUS", 12)} ${padRight("TYPE", 10)} ${padRight("CREATED", 10)}`,
          ),
        );
        console.log(chalk.dim("-".repeat(70)));

        for (const inst of instances) {
          const tpl = inst.scopeName;
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
    .description("Delete a scope instance")
    .argument("<name>", "Scope or instance name")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const api = makeApi();

      if (!opts.yes) {
        const confirm = await prompts({
          type: "confirm",
          name: "value",
          message: `Delete scope "${name}"?`,
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
    .requiredOption("--haseef <nameOrId>", "Haseef name or ID")
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

        const haseef = await resolveHaseefId(api, opts.haseef);
        await api.attachScope(haseef.id, inst.id);
        spinner.succeed(chalk.green(`Attached "${inst.scopeName}" to ${haseef.name}`));
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
    .requiredOption("--haseef <nameOrId>", "Haseef name or ID")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Detaching scope...").start();

      try {
        const haseef = await resolveHaseefId(api, opts.haseef);
        await api.detachScope(haseef.id, name);
        spinner.succeed(chalk.green(`Detached "${name}" from ${haseef.name}`));
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
