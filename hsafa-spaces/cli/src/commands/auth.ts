// =============================================================================
// hsafa auth login / logout / whoami / set-server
// =============================================================================

import { Command } from "commander";
import chalk from "chalk";
import prompts from "prompts";
import ora from "ora";
import http from "node:http";
import { exec } from "node:child_process";
import { loadConfig, saveConfig, clearAuth, requireAuth } from "../config.js";
import { ApiClient, ApiError } from "../api.js";

// ── Browser auth helpers ────────────────────────────────────────────────────

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  exec(`${cmd} "${url}"`);
}

async function validateAndSaveToken(token: string): Promise<boolean> {
  const config = loadConfig();
  const spinner = ora("Validating token...").start();

  try {
    const api = new ApiClient(config.serverUrl, token);
    const { user } = await api.me();

    config.token = token;
    config.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      entityId: user.entityId,
    };
    saveConfig(config);

    spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.name)} (${user.email})`));
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      spinner.fail(chalk.red("Invalid or expired token."));
    } else {
      spinner.fail(chalk.red("Could not reach server — is it running?"));
    }
    return false;
  }
}

// ── Commands ────────────────────────────────────────────────────────────────

export function registerAuthCommands(program: Command) {
  const auth = program.command("auth").description("Authentication commands");

  // ── login ─────────────────────────────────────────────────────────────────

  auth
    .command("login")
    .description("Log in with your Hsafa account")
    .option("--browser", "Log in via browser")
    .option("--token <token>", "Authenticate with an existing token")
    .option("--email <email>", "Email (for non-interactive / CI)")
    .option("--password <password>", "Password (for non-interactive / CI)")
    .action(async (opts: { browser?: boolean; token?: string; email?: string; password?: string }) => {
      const config = loadConfig();

      console.log(chalk.bold("\nHsafa CLI Login\n"));
      console.log(chalk.dim(`Server: ${config.serverUrl}\n`));

      // ── Direct token ──────────────────────────────────────────────────
      if (opts.token) {
        await validateAndSaveToken(opts.token);
        return;
      }

      // ── Non-interactive email/password (CI) ───────────────────────────
      if (opts.email && opts.password) {
        const spinner = ora("Logging in...").start();
        try {
          const api = new ApiClient(config.serverUrl);
          const { token, user } = await api.login(opts.email, opts.password);
          config.token = token;
          config.user = { id: user.id, email: user.email, name: user.name, entityId: user.entityId };
          saveConfig(config);
          spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.name)} (${user.email})`));
        } catch (err) {
          spinner.fail(chalk.red(err instanceof ApiError ? err.message : "Login failed — is the server running?"));
        }
        return;
      }

      // ── Choose method ─────────────────────────────────────────────────
      let method = opts.browser ? "browser" : undefined;

      if (!method) {
        const choice = await prompts({
          type: "select",
          name: "method",
          message: "How would you like to authenticate?",
          choices: [
            { title: "Browser", description: "Open browser to log in", value: "browser" },
            { title: "Paste token", description: "Paste an auth token", value: "token" },
            { title: "Email & password", description: "Enter credentials", value: "credentials" },
          ],
        });
        method = choice.method;
        if (!method) {
          console.log(chalk.dim("Cancelled."));
          return;
        }
      }

      // ── Browser flow ──────────────────────────────────────────────────
      if (method === "browser") {
        const serverUrl = config.serverUrl;

        // Start local HTTP server to receive the token callback
        let resolveToken: (token: string) => void;
        const tokenPromise = new Promise<string>((r) => { resolveToken = r; });

        const tokenServer = http.createServer((req, res) => {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (url.pathname === "/callback") {
            const token = url.searchParams.get("token");
            if (token) {
              res.writeHead(200, { "Content-Type": "text/html" });
              res.end(`<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff"><div style="text-align:center"><h1>&#10003; Authenticated</h1><p style="color:#888">You can close this window and return to the terminal.</p></div></body></html>`);
              tokenServer.close();
              resolveToken!(token);
            } else {
              res.writeHead(400, { "Content-Type": "text/plain" });
              res.end("Missing token.");
            }
          } else {
            res.writeHead(404);
            res.end();
          }
        });

        // Bind to a random port
        const port = await new Promise<number>((resolve) => {
          tokenServer.listen(0, "127.0.0.1", () => {
            resolve((tokenServer.address() as { port: number }).port);
          });
        });

        // 5 minute safety timeout
        const timeout = setTimeout(() => {
          tokenServer.close();
          console.log(chalk.red("\nLogin timed out."));
          process.exit(1);
        }, 5 * 60 * 1000);

        const callbackUrl = `http://localhost:${port}/callback`;
        const loginUrl = `${serverUrl}/auth?cli_callback=${encodeURIComponent(callbackUrl)}`;

        console.log(chalk.dim("Opening browser...\n"));
        openBrowser(loginUrl);
        console.log(
          chalk.dim("If the browser didn't open, visit:\n") +
          chalk.cyan(loginUrl) + "\n",
        );

        const spinner = ora("Waiting for login in browser...").start();

        try {
          const receivedToken = await tokenPromise;
          clearTimeout(timeout);
          spinner.stop();
          await validateAndSaveToken(receivedToken);
        } catch {
          spinner.fail(chalk.red("Browser login failed or timed out."));
          console.log(chalk.dim("\nYou can also paste a token manually:"));
          const fallback = await prompts({
            type: "text",
            name: "token",
            message: "Auth token",
          });
          if (fallback.token) {
            await validateAndSaveToken(fallback.token);
          }
        }
        return;
      }

      // ── Token paste ───────────────────────────────────────────────────
      if (method === "token") {
        const response = await prompts({
          type: "text",
          name: "token",
          message: "Auth token",
          validate: (v: string) => (v.length > 10 ? true : "Enter a valid token"),
        });

        if (!response.token) {
          console.log(chalk.dim("Cancelled."));
          return;
        }

        await validateAndSaveToken(response.token);
        return;
      }

      // ── Email + password ──────────────────────────────────────────────
      if (method === "credentials") {
        const response = await prompts([
          {
            type: "text",
            name: "email",
            message: "Email",
            validate: (v: string) => (v.includes("@") ? true : "Enter a valid email"),
          },
          {
            type: "password",
            name: "password",
            message: "Password",
            validate: (v: string) => (v.length >= 1 ? true : "Password is required"),
          },
        ]);

        if (!response.email || !response.password) {
          console.log(chalk.dim("Cancelled."));
          return;
        }

        const spinner = ora("Logging in...").start();

        try {
          const api = new ApiClient(config.serverUrl);
          const { token, user } = await api.login(response.email, response.password);

          config.token = token;
          config.user = { id: user.id, email: user.email, name: user.name, entityId: user.entityId };
          saveConfig(config);

          spinner.succeed(chalk.green(`Logged in as ${chalk.bold(user.name)} (${user.email})`));
        } catch (err) {
          if (err instanceof ApiError) {
            spinner.fail(chalk.red(err.message));
          } else {
            spinner.fail(chalk.red("Login failed — is the server running?"));
          }
        }
      }
    });

  // ── logout ────────────────────────────────────────────────────────────────

  auth
    .command("logout")
    .description("Log out and clear stored credentials")
    .action(() => {
      clearAuth();
      console.log(chalk.green("Logged out."));
    });

  // ── whoami ────────────────────────────────────────────────────────────────

  auth
    .command("whoami")
    .description("Show the currently authenticated user")
    .action(async () => {
      const { token, serverUrl } = requireAuth();

      const spinner = ora("Checking...").start();
      try {
        const api = new ApiClient(serverUrl, token);
        const { user } = await api.me();
        spinner.stop();

        console.log(chalk.bold(user.name));
        console.log(chalk.dim(`Email:    ${user.email}`));
        console.log(chalk.dim(`Entity:   ${user.entityId}`));
        console.log(chalk.dim(`Server:   ${serverUrl}`));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          spinner.fail("Session expired. Run: hsafa auth login");
          clearAuth();
        } else {
          spinner.fail("Could not reach server.");
        }
      }
    });

  // ── set-server ────────────────────────────────────────────────────────────

  auth
    .command("set-server")
    .description("Set the Hsafa server URL")
    .argument("<url>", "Server URL (e.g. https://spaces.hsafa.io)")
    .action((url: string) => {
      const config = loadConfig();
      config.serverUrl = url.replace(/\/$/, "");
      config.token = null;
      config.user = null;
      saveConfig(config);
      console.log(chalk.green(`Server set to ${config.serverUrl}`));
      console.log(chalk.dim("You'll need to log in again: hsafa auth login"));
    });
}
