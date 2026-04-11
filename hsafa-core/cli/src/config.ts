// =============================================================================
// Config — persists credentials + server URL to ~/.hsafa/config.json
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CONFIG_DIR = path.join(os.homedir(), ".hsafa");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export interface CliConfig {
  serverUrl: string;
  frontendUrl: string;
  token: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    entityId: string;
  } | null;
}

const DEFAULT_CONFIG: CliConfig = {
  serverUrl: "https://spaces.hsafa.com",
  frontendUrl: "https://spaces.hsafa.com",
  token: null,
  user: null,
};

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): CliConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // corrupt config — reset
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: CliConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

export function clearAuth(): void {
  const config = loadConfig();
  config.token = null;
  config.user = null;
  saveConfig(config);
}

export function getToken(): string | null {
  return loadConfig().token;
}

export function getServerUrl(): string {
  return loadConfig().serverUrl;
}

export function requireAuth(): { token: string; serverUrl: string } {
  const config = loadConfig();
  if (!config.token) {
    console.error("Not authenticated. Run: hsafa auth login");
    process.exit(1);
  }
  return { token: config.token, serverUrl: config.serverUrl };
}
