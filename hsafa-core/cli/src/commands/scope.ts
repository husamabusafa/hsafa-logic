// =============================================================================
// hsafa skill — simplified skill management
//   Commands: init, create, dev, install, publish, register,
//             list, delete, attach, detach
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
): Promise<ScopeInstance | null> {
  const { instances } = await api.listInstances();
  return (
    instances.find(
      (i) =>
        i.scopeName === nameOrScope ||
        i.name === nameOrScope ||
        i.template?.slug === nameOrScope,
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

async function quickSetup(
  api: ApiClient,
  scopeName: string,
  dir: string,
  haseefNameOrId?: string,
): Promise<{ scopeKey: string; coreUrl: string; instanceId: string } | null> {
  const spinner = ora("Registering skill...").start();

  try {
    const result = await api.quickCreateScope({ scopeName });
    spinner.succeed(
      result.alreadyExisted
        ? chalk.green(`Skill "${scopeName}" already exists — key refreshed`)
        : chalk.green(`Skill "${scopeName}" registered`),
    );

    writeEnvFile(dir, scopeName, result.scopeKey, result.coreUrl);
    console.log(chalk.dim(`  .env written (SCOPE_NAME, SCOPE_KEY, CORE_URL)`));

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

    return { scopeKey: result.scopeKey, coreUrl: result.coreUrl, instanceId: result.instance.id };
  } catch (err) {
    spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to register skill."));
    return null;
  }
}

// ── Register commands ───────────────────────────────────────────────────────

export function registerSkillCommands(program: Command) {
  const skill = program.command("skill").alias("scope").description("Manage skills");

  // ── init ──────────────────────────────────────────────────────────────────

  skill
    .command("init")
    .description("Scaffold a new skill project + register + configure")
    .argument("<name>", "Skill name")
    .option("--lang <language>", "Language: typescript, javascript, python", "typescript")
    .option("--starter <template>", "Starter: blank, api, database, webhook", "blank")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .action(async (name: string, opts: { lang: string; starter: string; haseef?: string }) => {
      const dir = path.resolve(process.cwd(), name);
      if (fs.existsSync(dir)) {
        console.error(chalk.red(`Directory "${name}" already exists.`));
        process.exit(1);
      }

      const spinner = ora("Scaffolding project...").start();
      try {
        scaffoldScope(dir, name, opts.lang, opts.starter);
        spinner.succeed(chalk.green(`Created ${chalk.bold(name)}/`));
      } catch (err: unknown) {
        spinner.fail(chalk.red(`Scaffold failed: ${err instanceof Error ? err.message : err}`));
        return;
      }

      const api = makeApi();
      const setup = await quickSetup(api, name, dir, opts.haseef);

      console.log();
      if (setup) {
        console.log(chalk.dim("  Next:"));
        console.log(chalk.dim(`  cd ${name}`));
        console.log(chalk.dim("  npm install"));
        console.log(chalk.dim("  hsafa skill dev"));
      } else {
        console.log(chalk.dim("  Next:"));
        console.log(chalk.dim(`  cd ${name}`));
        console.log(chalk.dim("  npm install"));
        console.log(chalk.dim("  hsafa skill create"));
        console.log(chalk.dim("  hsafa skill dev"));
      }
    });

  // ── create ────────────────────────────────────────────────────────────────

  skill
    .command("create")
    .description("Register an existing project as a skill (get a scope key)")
    .option("--name <name>", "Skill name (reads from package.json if omitted)")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .action(async (opts: { name?: string; haseef?: string }) => {
      const cwd = process.cwd();
      const scopeName = opts.name || readScopeNameFromDir(cwd);

      if (!scopeName) {
        console.error(chalk.red("Could not determine skill name."));
        console.error(chalk.dim("Run from a project directory with package.json, or use --name."));
        process.exit(1);
      }

      const api = makeApi();
      await quickSetup(api, scopeName, cwd, opts.haseef);
    });

  // ── dev ────────────────────────────────────────────────────────────────────

  skill
    .command("dev")
    .description("Auto-create skill if needed + start local dev server")
    .option("--haseef <name>", "Attach to a haseef (by name or ID)")
    .action(async (opts: { haseef?: string }) => {
      const cwd = process.cwd();
      const scopeName = readScopeNameFromDir(cwd);

      if (!scopeName) {
        console.error(chalk.red("Could not determine skill name."));
        console.error(chalk.dim("Run from a skill project directory."));
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
        cmd = "npm";
        args = ["run", "dev"];
      } else if (fs.existsSync(reqPath)) {
        cmd = "python";
        args = ["main.py"];
      } else {
        console.error(chalk.red("Could not detect project type."));
        process.exit(1);
      }

      const child = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...process.env } });
      child.on("exit", (code) => process.exit(code ?? 0));
      process.on("SIGINT", () => child.kill("SIGINT"));
      process.on("SIGTERM", () => child.kill("SIGTERM"));
    });

  // ── install (marketplace) ─────────────────────────────────────────────────

  skill
    .command("install")
    .description("Install a skill from the marketplace as a local project")
    .argument("<slug>", "Marketplace skill slug")
    .option("--dir <path>", "Directory name (defaults to slug)")
    .option("--haseef <name>", "Attach to a haseef after install")
    .action(async (slug: string, opts: { dir?: string; haseef?: string }) => {
      const api = makeApi();
      const spinner = ora(`Fetching marketplace skill "${slug}"...`).start();

      try {
        const { templates } = await api.listTemplates();
        const template = templates.find((t) => t.slug === slug);

        if (!template) {
          spinner.fail(chalk.red(`Skill "${slug}" not found in marketplace.`));
          console.log(chalk.dim("  Use `hsafa skill list --marketplace` to browse available skills."));
          return;
        }

        // Scaffold a local project from this template
        const dirName = opts.dir || slug;
        const dir = path.resolve(process.cwd(), dirName);
        if (fs.existsSync(dir)) {
          spinner.fail(chalk.red(`Directory "${dirName}" already exists.`));
          return;
        }

        spinner.text = "Scaffolding project...";
        scaffoldScope(dir, slug, "typescript", "blank");
        spinner.succeed(chalk.green(`Created ${chalk.bold(dirName)}/ from marketplace template "${template.name}"`));

        // Register + provision key
        const setup = await quickSetup(api, slug, dir, opts.haseef);

        console.log();
        if (setup) {
          console.log(chalk.dim("  Next:"));
          console.log(chalk.dim(`  cd ${dirName}`));
          console.log(chalk.dim("  npm install"));
          console.log(chalk.dim("  hsafa skill dev"));
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to install skill."));
        }
      }
    });

  // ── publish ───────────────────────────────────────────────────────────────

  skill
    .command("publish")
    .description("Publish your skill to the marketplace")
    .option("--name <name>", "Skill name (reads from project if omitted)")
    .option("--slug <slug>", "Marketplace slug")
    .option("--description <text>", "Description")
    .option("--icon <icon>", "Icon name (e.g. Database, Plug)")
    .option("--private", "Only visible to you")
    .action(async (opts: { name?: string; slug?: string; description?: string; icon?: string; private?: boolean }) => {
      const cwd = process.cwd();
      const scopeName = opts.name || readScopeNameFromDir(cwd);

      if (!scopeName) {
        console.error(chalk.red("Could not determine skill name."));
        console.error(chalk.dim("Run from a skill project directory, or use --name."));
        process.exit(1);
      }

      const api = makeApi();
      const spinner = ora(`Publishing "${scopeName}" to marketplace...`).start();

      try {
        const inst = await resolveInstance(api, scopeName);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${scopeName}" not found. Create it first with \`hsafa skill create\`.`));
          return;
        }

        const result = await api.publishInstance(inst.id, {
          name: opts.name,
          slug: opts.slug,
          description: opts.description,
          icon: opts.icon,
          isPublic: opts.private ? false : true,
        });

        spinner.succeed(chalk.green(`Published "${scopeName}" to marketplace!`));
        console.log();
        console.log(`  ${chalk.bold("Template:")}  ${result.template.name}`);
        console.log(`  ${chalk.bold("Slug:")}      ${result.template.slug}`);
        console.log(`  ${chalk.bold("Action:")}    ${result.action}`);
        if (opts.private) {
          console.log(`  ${chalk.bold("Visibility:")} ${chalk.yellow("Private (only you)")}`);
        } else {
          console.log(`  ${chalk.bold("Visibility:")} ${chalk.green("Public")}`);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to publish skill."));
        }
      }
    });

  // ── register (external skill with existing key) ───────────────────────────

  skill
    .command("register")
    .description("Register a self-hosted skill that already has a key")
    .requiredOption("--key <scopeKey>", "Skill key (hsk_scope_...)")
    .requiredOption("--name <name>", "Skill name")
    .option("--description <desc>", "Description")
    .action(async (opts: { key: string; name: string; description?: string }) => {
      if (!opts.key.startsWith("hsk_scope_")) {
        console.error(chalk.red("Skill key must start with hsk_scope_"));
        process.exit(1);
      }

      const api = makeApi();
      const spinner = ora("Registering external skill...").start();

      try {
        const result = await api.registerExternalScope({
          scopeName: opts.name,
          displayName: opts.name,
          scopeKey: opts.key,
          description: opts.description,
        });

        spinner.succeed(chalk.green("Skill registered!"));
        console.log();
        console.log(`  ${chalk.bold("Name:")}       ${result.instance.name}`);
        console.log(`  ${chalk.bold("Scope:")}      ${result.instance.scopeName}`);
        console.log(chalk.dim("\n  Attach to a haseef: hsafa skill attach " + opts.name + " --haseef <name>"));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to register skill."));
        }
      }
    });

  // ── list ──────────────────────────────────────────────────────────────────

  skill
    .command("list")
    .alias("ls")
    .description("List all skills")
    .action(async () => {
      const api = makeApi();
      const spinner = ora("Fetching skills...").start();

      try {
        const { instances } = await api.listInstances();
        spinner.stop();

        if (instances.length === 0) {
          console.log(chalk.dim("No skills found."));
          return;
        }

        console.log(
          chalk.bold(
            `${padRight("SKILL", 20)} ${padRight("STATUS", 14)} ${padRight("CREATED", 10)}`,
          ),
        );
        console.log(chalk.dim("-".repeat(50)));

        for (const inst of instances) {
          const status = inst.connected ? "connected" : "disconnected";
          const statusColor = inst.connected ? chalk.green : chalk.dim;

          console.log(
            `${padRight(inst.scopeName || inst.name, 20)} ${statusColor(padRight(status, 14))} ${chalk.dim(padRight(formatTime(inst.createdAt), 10))}`,
          );
        }
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to list skills."));
        }
      }
    });

  // ── delete ────────────────────────────────────────────────────────────────

  skill
    .command("delete")
    .description("Delete a skill")
    .argument("<name>", "Skill name")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const api = makeApi();

      if (!opts.yes) {
        const confirm = await prompts({
          type: "confirm",
          name: "value",
          message: `Delete skill "${name}"?`,
          initial: false,
        });
        if (!confirm.value) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      const spinner = ora("Deleting skill...").start();

      try {
        const inst = await resolveInstance(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${name}" not found.`));
          return;
        }

        await api.deleteInstance(inst.id);
        spinner.succeed(chalk.green(`Deleted "${name}"`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to delete skill."));
        }
      }
    });

  // ── attach ────────────────────────────────────────────────────────────────

  skill
    .command("attach")
    .description("Attach a skill to a haseef")
    .argument("<name>", "Skill name")
    .requiredOption("--haseef <name>", "Haseef name or ID")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Attaching skill...").start();

      try {
        const inst = await resolveInstance(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${name}" not found.`));
          return;
        }

        const haseef = await resolveHaseefId(api, opts.haseef);
        await api.attachScope(haseef.id, inst.id);
        spinner.succeed(chalk.green(`Attached "${name}" to ${haseef.name}`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to attach skill."));
        }
      }
    });

  // ── detach ────────────────────────────────────────────────────────────────

  skill
    .command("detach")
    .description("Detach a skill from a haseef")
    .argument("<name>", "Skill name")
    .requiredOption("--haseef <name>", "Haseef name or ID")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Detaching skill...").start();

      try {
        const haseef = await resolveHaseefId(api, opts.haseef);
        await api.detachScope(haseef.id, name);
        spinner.succeed(chalk.green(`Detached "${name}" from ${haseef.name}`));
      } catch (err) {
        if (err instanceof ApiError) {
          spinner.fail(chalk.red(err.message));
        } else {
          spinner.fail(chalk.red("Failed to detach skill."));
        }
      }
    });
}
