// =============================================================================
// Scaffold — generates starter skill projects for v7 (built with @hsafa/sdk).
//
// Generated projects use these env vars:
//   SKILL_NAME       Name registered with Core (e.g. "weather")
//   HSAFA_CORE_URL   Core URL (e.g. http://localhost:3001)
//   HSAFA_CORE_KEY   Core's SECRET_KEY (sent as x-api-key)
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { writeHsafaContext } from "./hsafa-context.js";

export function scaffoldSkill(
  dir: string,
  name: string,
  lang: string,
  starter: string,
): void {
  fs.mkdirSync(dir, { recursive: true });

  if (lang === "typescript" || lang === "javascript") {
    scaffoldNode(dir, name, lang, starter);
  } else if (lang === "python") {
    scaffoldPython(dir, name, starter);
  } else {
    throw new Error(`Unsupported language: ${lang}`);
  }
}

// ── Node.js / TypeScript ────────────────────────────────────────────────────

function scaffoldNode(dir: string, name: string, lang: string, starter: string) {
  const isTs = lang === "typescript";
  const ext = isTs ? "ts" : "js";

  // package.json
  const pkg: Record<string, unknown> = {
    name,
    version: "0.1.0",
    type: "module",
    hsafa: { skill: name },
    scripts: {
      dev: isTs ? "tsx watch --env-file=.env src/index.ts" : "node --watch --env-file=.env src/index.js",
      start: isTs ? "tsx --env-file=.env src/index.ts" : "node --env-file=.env src/index.js",
    },
    dependencies: {
      "@hsafa/sdk": "0.1.0",
    },
    ...(isTs
      ? {
          devDependencies: {
            "@types/node": "^20",
            typescript: "^5",
            tsx: "^4",
          },
        }
      : {}),
  };
  writeJson(dir, "package.json", pkg);

  // tsconfig
  if (isTs) {
    writeJson(dir, "tsconfig.json", {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
      },
      include: ["src"],
    });
  }

  // .env
  writeFile(
    dir,
    ".env",
    [
      `SKILL_NAME=${name}`,
      `HSAFA_CORE_URL=http://localhost:3001`,
      `HSAFA_CORE_KEY=`,
      ``,
    ].join("\n"),
  );

  // .gitignore
  writeFile(dir, ".gitignore", "node_modules\ndist\n.env\n");

  // src/
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  writeFile(srcDir, `tools.${ext}`, getToolsContent(starter, ext));
  writeFile(srcDir, `handler.${ext}`, getHandlerContent(starter, ext));
  writeFile(srcDir, `index.${ext}`, getIndexContent(name, ext));

  // README
  writeFile(
    dir,
    "README.md",
    [
      `# ${name}`,
      ``,
      `A Hsafa skill — connects to Hsafa Core via [\`@hsafa/sdk\`](https://www.npmjs.com/package/@hsafa/sdk).`,
      ``,
      `## Setup`,
      ``,
      "```bash",
      `npm install`,
      `# Edit .env: set HSAFA_CORE_KEY to your Core SECRET_KEY`,
      `npm run dev`,
      "```",
      ``,
      `## Environment`,
      ``,
      `| Variable | Purpose |`,
      `|----------|---------|`,
      `| \`SKILL_NAME\` | Skill name registered with Core (default: \`${name}\`) |`,
      `| \`HSAFA_CORE_URL\` | Core URL (default: \`http://localhost:3001\`) |`,
      `| \`HSAFA_CORE_KEY\` | Core's \`SECRET_KEY\` — used as \`x-api-key\` |`,
      ``,
    ].join("\n"),
  );

  // .hsafa/ AI context folder
  writeHsafaContext(dir);
}

// ── Python ──────────────────────────────────────────────────────────────────

function scaffoldPython(dir: string, name: string, _starter: string) {
  writeFile(
    dir,
    "requirements.txt",
    "# Add your dependencies here\n# A Python @hsafa/sdk is not yet available — use raw HTTP/SSE.\n",
  );

  writeFile(
    dir,
    ".env",
    [
      `SKILL_NAME=${name}`,
      `HSAFA_CORE_URL=http://localhost:3001`,
      `HSAFA_CORE_KEY=`,
      ``,
    ].join("\n"),
  );

  writeFile(dir, ".gitignore", "__pycache__\n*.pyc\n.env\nvenv\n");

  writeFile(
    dir,
    "main.py",
    [
      `"""${name} — Hsafa skill (Python)`,
      ``,
      `A Python SDK is not yet published. Use raw HTTP + SSE against Core:`,
      `  PUT  {HSAFA_CORE_URL}/api/v7/skills/{SKILL_NAME}/tools         (register tools)`,
      `  GET  {HSAFA_CORE_URL}/api/v7/skills/{SKILL_NAME}/actions/stream (SSE: tool calls)`,
      `  POST {HSAFA_CORE_URL}/api/v7/actions/{actionId}/result          (return result)`,
      `  POST {HSAFA_CORE_URL}/api/v7/events                              (push events)`,
      `Authenticate every call with x-api-key: {HSAFA_CORE_KEY}.`,
      `"""`,
      `import os`,
      ``,
      `SKILL_NAME = os.environ.get("SKILL_NAME", "${name}")`,
      `CORE_URL   = os.environ.get("HSAFA_CORE_URL", "http://localhost:3001")`,
      `API_KEY    = os.environ.get("HSAFA_CORE_KEY", "")`,
      ``,
      `print(f"[{SKILL_NAME}] Starting — Core: {CORE_URL}")`,
      ``,
      `# TODO: PUT /api/skills/{SKILL_NAME}/tools and open SSE stream`,
      ``,
    ].join("\n"),
  );

  writeFile(
    dir,
    "README.md",
    [
      `# ${name}`,
      ``,
      `Hsafa skill (Python).`,
      ``,
      `## Setup`,
      ``,
      "```bash",
      `pip install -r requirements.txt`,
      `# Edit .env: set HSAFA_CORE_KEY`,
      `python main.py`,
      "```",
    ].join("\n"),
  );

  writeHsafaContext(dir);
}

// ── Content generators ──────────────────────────────────────────────────────

function getIndexContent(name: string, ext: string): string {
  const isTs = ext === "ts";
  const importLine = isTs
    ? `import { HsafaSDK } from "@hsafa/sdk";`
    : `const { HsafaSDK } = require("@hsafa/sdk");`;

  return `${importLine}
import { tools } from "./tools.${isTs ? "js" : ext}";
import { handlers } from "./handler.${isTs ? "js" : ext}";

const hsafa = new HsafaSDK({
  coreUrl: process.env.HSAFA_CORE_URL || "http://localhost:3001",
  apiKey:  process.env.HSAFA_CORE_KEY  || "",
  skill:   process.env.SKILL_NAME      || "${name}",
});

async function main() {
  // 1. Register tools with Core
  await hsafa.registerTools(tools);
  console.log(\`[\${hsafa.skill}] Registered \${tools.length} tools\`);

  // 2. Wire up handlers
  for (const [toolName, handler] of Object.entries(handlers)) {
    hsafa.onToolCall(toolName, handler${isTs ? " as any" : ""});
  }

  // 3. Connect — SSE stream, auto-reconnects
  hsafa.connect();
  console.log(\`[\${hsafa.skill}] Connected to Core — ready for tool calls\`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

process.on("SIGINT",  () => { hsafa.disconnect(); process.exit(0); });
process.on("SIGTERM", () => { hsafa.disconnect(); process.exit(0); });
`;
}

function getToolsContent(starter: string, ext: string): string {
  const isTs = ext === "ts";
  const typeAnnotation = isTs ? ": any[]" : "";

  if (starter === "api") {
    return `// Tool definitions for your skill
export const tools${typeAnnotation} = [
  {
    name: "fetch_data",
    description: "Fetch data from the external API",
    input: { query: "string" },
  },
  {
    name: "get_status",
    description: "Check API status",
    input: {},
  },
];
`;
  }

  if (starter === "database") {
    return `// Tool definitions for your skill
export const tools${typeAnnotation} = [
  {
    name: "query",
    description: "Run a read-only SQL query (SELECT only)",
    input: { sql: "string" },
  },
  {
    name: "list_tables",
    description: "List all tables in the database",
    input: {},
  },
];
`;
  }

  if (starter === "webhook") {
    return `// Tool definitions for your skill
export const tools${typeAnnotation} = [
  {
    name: "list_events",
    description: "List recent webhook events",
    input: { limit: "number?" },
  },
];
`;
  }

  // blank
  return `// Tool definitions for your skill
export const tools${typeAnnotation} = [
  {
    name: "hello",
    description: "A simple greeting tool",
    input: { name: "string" },
  },
];
`;
}

function getHandlerContent(starter: string, ext: string): string {
  const isTs = ext === "ts";
  const typeAnnotation = isTs ? ": Record<string, (args: any, ctx: any) => Promise<any>>" : "";

  if (starter === "api") {
    return `// Tool handlers — implement your logic here
export const handlers${typeAnnotation} = {
  async fetch_data(args${isTs ? ": { query: string }" : ""}) {
    const response = await fetch(\`https://api.example.com/search?q=\${encodeURIComponent(args.query)}\`);
    return { results: await response.json() };
  },

  async get_status() {
    return { status: "ok", timestamp: new Date().toISOString() };
  },
};
`;
  }

  if (starter === "database") {
    return `// Tool handlers — implement your logic here
export const handlers${typeAnnotation} = {
  async query(args${isTs ? ": { sql: string }" : ""}) {
    // TODO: connect to your database
    return { rows: [], message: "TODO: wire up your DB client" };
  },

  async list_tables() {
    return { tables: [] };
  },
};
`;
  }

  if (starter === "webhook") {
    return `// Tool handlers — implement your logic here

const events${isTs ? ": any[]" : ""} = []; // In-memory store for demo

export const handlers${typeAnnotation} = {
  async list_events(args${isTs ? ": { limit?: number }" : ""}) {
    return { events: events.slice(-(args.limit || 10)) };
  },
};

// TODO: Stand up an HTTP server to receive webhooks, then call hsafa.pushEvent(...)
`;
  }

  // blank
  return `// Tool handlers — implement your logic here
export const handlers${typeAnnotation} = {
  async hello(args${isTs ? ": { name: string }" : ""}, ctx${isTs ? ": { haseef: { id: string; name: string } }" : ""}) {
    // ctx.haseef.id is the haseef calling this tool — useful for memory:
    //   await hsafa.memory.set(ctx.haseef.id, [{ key: "last_greeted", value: args.name }]);
    return { message: \`Hello, \${args.name}!\` };
  },
};
`;
}

// ── File helpers ─────────────────────────────────────────────────────────────

function writeFile(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content, "utf-8");
}

function writeJson(dir: string, name: string, data: unknown) {
  writeFile(dir, name, JSON.stringify(data, null, 2) + "\n");
}
