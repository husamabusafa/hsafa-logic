// =============================================================================
// Scaffold — generates starter scope projects
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import { writeHsafaContext } from "./hsafa-context.js";

export function scaffoldScope(
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
    hsafa: { scope: name },
    scripts: {
      dev: isTs ? "npx tsx watch src/index.ts" : "node --watch src/index.js",
      start: isTs ? "npx tsx src/index.ts" : "node src/index.js",
    },
    dependencies: {
      "@hsafa/sdk": "^0.0.1",
      dotenv: "^16.4.5",
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
    `SCOPE_NAME=${name}\nSCOPE_KEY=\nCORE_URL=http://localhost:3001\n`,
  );

  // .gitignore
  writeFile(dir, ".gitignore", "node_modules\ndist\n.env\n");

  // src/
  const srcDir = path.join(dir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  // Tools file
  const toolsContent = getToolsContent(starter, ext);
  writeFile(srcDir, `tools.${ext}`, toolsContent);

  // Handler file
  const handlerContent = getHandlerContent(starter, ext);
  writeFile(srcDir, `handler.${ext}`, handlerContent);

  // Index file
  const indexContent = getIndexContent(name, ext);
  writeFile(srcDir, `index.${ext}`, indexContent);

  // README
  writeFile(
    dir,
    "README.md",
    `# ${name}\n\nHsafa scope — built with @hsafa/sdk.\n\n## Setup\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nEnvironment variables (\`.env\`) are auto-configured by \`hsafa scope init\`.\n`,
  );

  // .hsafa/ AI context folder
  writeHsafaContext(dir);
}

// ── Python ──────────────────────────────────────────────────────────────────

function scaffoldPython(dir: string, name: string, _starter: string) {
  writeFile(
    dir,
    "requirements.txt",
    "# Add your dependencies here\n# hsafa-sdk (when published)\n",
  );

  writeFile(
    dir,
    ".env",
    `SCOPE_NAME=${name}\nSCOPE_KEY=\nCORE_URL=http://localhost:3001\n`,
  );

  writeFile(dir, ".gitignore", "__pycache__\n*.pyc\n.env\nvenv\n");

  writeFile(
    dir,
    "main.py",
    `"""${name} — Hsafa scope"""\nimport os\n\n# TODO: Use hsafa Python SDK when available\n# from hsafa import HsafaSDK\n\nSCOPE_NAME = os.environ.get("SCOPE_NAME", "${name}")\nSCOPE_KEY = os.environ.get("SCOPE_KEY", "")\nCORE_URL = os.environ.get("CORE_URL", "http://localhost:3001")\n\nprint(f"[{SCOPE_NAME}] Starting...")\n\n# sdk = HsafaSDK(core_url=CORE_URL, api_key=SCOPE_KEY, scope=SCOPE_NAME)\n# sdk.register_tools([...])\n# sdk.connect()\n`,
  );

  writeFile(
    dir,
    "README.md",
    `# ${name}\n\nHsafa scope (Python).\n\n## Setup\n\n\`\`\`bash\npip install -r requirements.txt\nhsafa scope create ${name}\n# Copy the scope key to .env\npython main.py\nhsafa scope attach ${name} --haseef <haseef-id>\n\`\`\`\n`,
  );

  // .hsafa/ AI context folder
  writeHsafaContext(dir);
}

// ── Content generators ──────────────────────────────────────────────────────

function getIndexContent(name: string, ext: string): string {
  const isTs = ext === "ts";
  return `${isTs ? 'import "dotenv/config";\nimport { HsafaSDK } from "@hsafa/sdk";\n' : 'require("dotenv/config");\nconst { HsafaSDK } = require("@hsafa/sdk");\n'}import { tools } from "./tools.${ext === "ts" ? "js" : ext}";\nimport { handlers } from "./handler.${ext === "ts" ? "js" : ext}";\n
const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL || "http://localhost:3001",
  apiKey: process.env.SCOPE_KEY || "",
  scope: process.env.SCOPE_NAME || "${name}",
});

async function main() {
  // Register tools with Core
  await sdk.registerTools(tools);
  console.log(\`[\${sdk.scope}] Registered \${tools.length} tools\`);

  // Wire up handlers
  for (const [toolName, handler] of Object.entries(handlers)) {
    sdk.onToolCall(toolName, handler${isTs ? " as any" : ""});
  }

  // Connect — starts listening for tool calls via SSE
  sdk.connect();
  console.log(\`[\${sdk.scope}] Connected to Core — ready for tool calls\`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
`;
}

function getToolsContent(starter: string, ext: string): string {
  const isTs = ext === "ts";
  const typeAnnotation = isTs ? ": any[]" : "";

  if (starter === "api") {
    return `// Tool definitions for your scope
export const tools${typeAnnotation} = [
  {
    name: "fetch_data",
    description: "Fetch data from the external API",
    input: {
      query: { type: "string", description: "Search query" },
    },
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
    return `// Tool definitions for your scope
export const tools${typeAnnotation} = [
  {
    name: "query",
    description: "Run a read-only SQL query",
    input: {
      sql: { type: "string", description: "SQL query to execute" },
    },
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
    return `// Tool definitions for your scope
export const tools${typeAnnotation} = [
  {
    name: "list_events",
    description: "List recent webhook events",
    input: {
      limit: { type: "number", description: "Max events to return" },
    },
  },
];
`;
  }

  // blank
  return `// Tool definitions for your scope
export const tools${typeAnnotation} = [
  {
    name: "hello",
    description: "A simple greeting tool",
    input: {
      name: { type: "string", description: "Name to greet" },
    },
  },
];
`;
}

function getHandlerContent(starter: string, ext: string): string {
  const isTs = ext === "ts";
  const typeAnnotation = isTs ? ": Record<string, (args: any) => Promise<any>>" : "";

  if (starter === "api") {
    return `// Tool handlers — implement your logic here
export const handlers${typeAnnotation} = {
  async fetch_data(args${isTs ? ": { query: string }" : ""}) {
    // Replace with your actual API call
    const response = await fetch(\`https://api.example.com/search?q=\${encodeURIComponent(args.query)}\`);
    const data = await response.json();
    return { results: data };
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
    // Replace with your actual database client
    // import { pool } from "./db";
    // const result = await pool.query(args.sql);
    return { rows: [], message: "TODO: connect to your database" };
  },

  async list_tables() {
    return { tables: [], message: "TODO: connect to your database" };
  },
};
`;
  }

  if (starter === "webhook") {
    return `// Tool handlers — implement your logic here

const events${isTs ? ": any[]" : ""} = []; // In-memory store for demo

export const handlers${typeAnnotation} = {
  async list_events(args${isTs ? ": { limit?: number }" : ""}) {
    const limit = args.limit || 10;
    return { events: events.slice(-limit) };
  },
};

// TODO: Set up an HTTP server to receive webhooks
// and push them as sense events via sdk.pushEvent()
`;
  }

  // blank
  return `// Tool handlers — implement your logic here
export const handlers${typeAnnotation} = {
  async hello(args${isTs ? ": { name: string }" : ""}) {
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
