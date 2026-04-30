// =============================================================================
// hsafa skill — manage skills for v7 Hsafa Core
//
// Two distinct workflows are supported:
//
//  1. Custom skill projects (built with @hsafa/sdk):
//       hsafa skill init <name>     — scaffold a project
//       hsafa skill dev             — run it locally (npm run dev)
//
//  2. Skill instances on the Spaces server (templates → instances):
//       hsafa skill templates       — list available skill templates
//       hsafa skill list            — list your skill instances
//       hsafa skill create          — create instance from template
//       hsafa skill delete <name>   — delete an instance
//       hsafa skill attach          — attach instance to a haseef
//       hsafa skill detach          — detach instance from a haseef
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
import type { SkillInstance } from "../api.js";
import { scaffoldSkill } from "../scaffold.js";

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

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

async function findInstanceByName(
  api: ApiClient,
  name: string,
): Promise<SkillInstance | null> {
  const { instances } = await api.listInstances();
  const lower = name.toLowerCase();
  return (
    instances.find(
      (i) =>
        i.name.toLowerCase() === lower ||
        i.displayName?.toLowerCase() === lower,
    ) ?? null
  );
}

function readSkillNameFromDir(dir: string): string | null {
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return pkg.hsafa?.skill || pkg.name?.replace(/^@.*\//, "") || null;
    } catch { return null; }
  }
  const reqPath = path.join(dir, "requirements.txt");
  if (fs.existsSync(reqPath)) return path.basename(dir);
  return null;
}

// ── Register commands ───────────────────────────────────────────────────────

export function registerSkillCommands(program: Command) {
  const skill = program.command("skill").description("Manage skills");

  // ── init (custom skill scaffold) ──────────────────────────────────────────

  skill
    .command("init")
    .description("Scaffold a new custom skill project (built with @hsafa/sdk)")
    .argument("<name>", "Skill name (lowercase, snake_case, e.g. weather)")
    .option("--lang <language>", "Language: typescript | javascript | python", "typescript")
    .option("--starter <template>", "Starter: blank | api | database | webhook", "blank")
    .action((name: string, opts: { lang: string; starter: string }) => {
      if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
        console.error(chalk.red(`Invalid skill name "${name}". Use lowercase letters, digits, _ or -, starting with a letter.`));
        process.exit(1);
      }

      const dir = path.resolve(process.cwd(), name);
      if (fs.existsSync(dir)) {
        console.error(chalk.red(`Directory "${name}" already exists.`));
        process.exit(1);
      }

      const spinner = ora("Scaffolding project...").start();
      try {
        scaffoldSkill(dir, name, opts.lang, opts.starter);
        spinner.succeed(chalk.green(`Created ${chalk.bold(name)}/`));
      } catch (err) {
        spinner.fail(chalk.red(`Scaffold failed: ${err instanceof Error ? err.message : err}`));
        return;
      }

      console.log();
      console.log(chalk.dim("  Next:"));
      console.log(chalk.dim(`    cd ${name}`));
      console.log(chalk.dim("    # Set HSAFA_CORE_URL and HSAFA_CORE_KEY in .env"));
      if (opts.lang !== "python") console.log(chalk.dim("    npm install"));
      console.log(chalk.dim("    hsafa skill dev"));
    });

  // ── dev (run a local skill project) ──────────────────────────────────────

  skill
    .command("dev")
    .description("Start the local skill dev server (delegates to npm run dev / python main.py)")
    .action(() => {
      const cwd = process.cwd();
      const skillName = readSkillNameFromDir(cwd);
      if (!skillName) {
        console.error(chalk.red("Could not determine skill name."));
        console.error(chalk.dim("Run from a project directory with package.json or requirements.txt."));
        process.exit(1);
      }

      console.log(chalk.bold(`Starting dev server for ${skillName}...`));
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
        console.error(chalk.red("Could not detect project type (no package.json or requirements.txt)."));
        process.exit(1);
      }

      const child = spawn(cmd, args, { cwd, stdio: "inherit", env: { ...process.env } });
      child.on("exit", (code) => process.exit(code ?? 0));
      process.on("SIGINT", () => child.kill("SIGINT"));
      process.on("SIGTERM", () => child.kill("SIGTERM"));
    });

  // ── templates (list available skill templates from Spaces) ────────────────

  skill
    .command("templates")
    .description("List available skill templates on the Spaces server")
    .action(async () => {
      const api = makeApi();
      const spinner = ora("Fetching templates...").start();
      try {
        const { templates } = await api.listTemplates();
        spinner.stop();

        if (templates.length === 0) {
          console.log(chalk.dim("No templates available."));
          return;
        }

        console.log(
          chalk.bold(
            `${padRight("NAME", 20)} ${padRight("DISPLAY", 28)} ${padRight("CATEGORY", 14)}`,
          ),
        );
        console.log(chalk.dim("-".repeat(64)));

        for (const t of templates) {
          console.log(
            `${padRight(t.name, 20)} ${padRight(t.displayName, 28)} ${chalk.dim(padRight(t.category ?? "—", 14))}`,
          );
        }
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to list templates."));
      }
    });

  // ── list (your skill instances) ──────────────────────────────────────────

  skill
    .command("list")
    .alias("ls")
    .description("List your skill instances")
    .action(async () => {
      const api = makeApi();
      const spinner = ora("Fetching skills...").start();

      try {
        const { instances } = await api.listInstances();
        spinner.stop();

        if (instances.length === 0) {
          console.log(chalk.dim("No skill instances found."));
          console.log(chalk.dim("Create one with: hsafa skill create <name> --template <template-name>"));
          return;
        }

        console.log(
          chalk.bold(
            `${padRight("NAME", 22)} ${padRight("STATUS", 14)} ${padRight("CREATED", 12)}`,
          ),
        );
        console.log(chalk.dim("-".repeat(50)));

        for (const inst of instances) {
          const status = inst.connected ? "connected" : "disconnected";
          const statusColor = inst.connected ? chalk.green : chalk.dim;
          console.log(
            `${padRight(inst.name, 22)} ${statusColor(padRight(status, 14))} ${chalk.dim(padRight(formatTime(inst.createdAt), 12))}`,
          );
        }
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to list skills."));
      }
    });

  // ── create (instance from template) ───────────────────────────────────────

  skill
    .command("create")
    .description("Create a skill instance from a template")
    .argument("<name>", "Unique instance name (lowercase, snake_case)")
    .requiredOption("--template <name>", "Template name (see `hsafa skill templates`)")
    .option("--display <text>", "Display name (defaults to <name>)")
    .option("--config <json>", "Inline JSON config", "{}")
    .action(async (name: string, opts: { template: string; display?: string; config: string }) => {
      if (!/^[a-z][a-z0-9_]{1,48}$/.test(name)) {
        console.error(chalk.red(`Invalid name "${name}". Must be lowercase, start with a letter, use a-z 0-9 _ (2-49 chars).`));
        process.exit(1);
      }

      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(opts.config);
      } catch {
        console.error(chalk.red("Invalid --config JSON."));
        process.exit(1);
      }

      const api = makeApi();
      const spinner = ora(`Creating instance "${name}" from template "${opts.template}"...`).start();
      try {
        const { instance } = await api.createInstance({
          name,
          displayName: opts.display ?? name,
          templateName: opts.template,
          config,
        });
        spinner.succeed(chalk.green(`Created skill instance "${instance.name}"`));
        console.log();
        console.log(`  ${chalk.bold("ID:")}        ${instance.id}`);
        console.log(`  ${chalk.bold("Status:")}    ${instance.status}`);
        console.log(chalk.dim("\n  Attach to a haseef: hsafa skill attach " + name + " --haseef <name>"));
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to create instance."));
      }
    });

  // ── delete ────────────────────────────────────────────────────────────────

  skill
    .command("delete")
    .description("Delete a skill instance")
    .argument("<name>", "Skill instance name")
    .option("-y, --yes", "Skip confirmation")
    .action(async (name: string, opts: { yes?: boolean }) => {
      const api = makeApi();

      if (!opts.yes) {
        const confirm = await prompts({
          type: "confirm",
          name: "value",
          message: `Delete skill instance "${name}"?`,
          initial: false,
        });
        if (!confirm.value) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      const spinner = ora("Deleting...").start();
      try {
        const inst = await findInstanceByName(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${name}" not found.`));
          return;
        }
        await api.deleteInstance(inst.id);
        spinner.succeed(chalk.green(`Deleted "${name}"`));
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to delete skill."));
      }
    });

  // ── attach ────────────────────────────────────────────────────────────────

  skill
    .command("attach")
    .description("Attach a skill instance to a haseef")
    .argument("<name>", "Skill instance name")
    .requiredOption("--haseef <name>", "Haseef name or UUID")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Attaching...").start();

      try {
        const inst = await findInstanceByName(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${name}" not found.`));
          return;
        }
        const haseef = await api.resolveHaseef(opts.haseef);
        await api.attachInstance(inst.id, haseef.id);
        spinner.succeed(chalk.green(`Attached "${name}" to ${haseef.name}`));
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to attach skill."));
      }
    });

  // ── detach ────────────────────────────────────────────────────────────────

  skill
    .command("detach")
    .description("Detach a skill instance from a haseef")
    .argument("<name>", "Skill instance name")
    .requiredOption("--haseef <name>", "Haseef name or UUID")
    .action(async (name: string, opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Detaching...").start();

      try {
        const inst = await findInstanceByName(api, name);
        if (!inst) {
          spinner.fail(chalk.red(`Skill "${name}" not found.`));
          return;
        }
        const haseef = await api.resolveHaseef(opts.haseef);
        await api.detachInstance(inst.id, haseef.id);
        spinner.succeed(chalk.green(`Detached "${name}" from ${haseef.name}`));
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to detach skill."));
      }
    });

  // ── show (haseef → attached skills) ──────────────────────────────────────

  skill
    .command("show")
    .description("List all skills attached to a haseef")
    .requiredOption("--haseef <name>", "Haseef name or UUID")
    .action(async (opts: { haseef: string }) => {
      const api = makeApi();
      const spinner = ora("Fetching...").start();
      try {
        const haseef = await api.resolveHaseef(opts.haseef);
        const { skills } = await api.listHaseefSkills(haseef.id);
        spinner.stop();

        console.log(chalk.bold(`Skills attached to ${haseef.name}:\n`));
        if (skills.length === 0) {
          console.log(chalk.dim("  (none)"));
          return;
        }
        for (const hs of skills) {
          const status = hs.connected ? chalk.green("connected") : chalk.dim("disconnected");
          console.log(`  ${padRight(hs.instance.name, 22)} ${status}`);
        }
      } catch (err) {
        spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Failed to fetch attached skills."));
      }
    });
}
