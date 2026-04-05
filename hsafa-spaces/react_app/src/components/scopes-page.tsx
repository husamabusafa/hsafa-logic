import { useState, useEffect, useCallback } from "react";
import {
  PuzzleIcon,
  PlusIcon,
  SearchIcon,
  ChevronRightIcon,
  WrenchIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
  CodeIcon,
  TerminalIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  FolderTreeIcon,
  GlobeIcon,
  DatabaseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopesApi,
  type ScopeTemplate,
  type ScopeInstance,
  type CoreScopeStatus,
} from "@/lib/api";

// ── Icon resolver ────────────────────────────────────────────────────────────

function ScopeIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = cn("size-5", className);
  switch (icon) {
    case "MessageSquare": return <MessageSquareIcon className={cls} />;
    case "Calendar": return <CalendarIcon className={cls} />;
    case "Database": return <DatabaseIcon className={cls} />;
    case "Plug": return <PlugIcon className={cls} />;
    default: return <PuzzleIcon className={cls} />;
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

interface ScopesPageProps {
  onNavigateToInstance?: (instanceId: string) => void;
  onNavigateToTemplate?: (templateId: string) => void;
}

export function ScopesPage({ onNavigateToInstance, onNavigateToTemplate }: ScopesPageProps) {
  const [tab, setTab] = useState<"instances" | "templates" | "developer">("instances");
  const [templates, setTemplates] = useState<ScopeTemplate[]>([]);
  const [instances, setInstances] = useState<ScopeInstance[]>([]);
  const [statuses, setStatuses] = useState<CoreScopeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, iRes, sRes] = await Promise.all([
        scopesApi.listTemplates(),
        scopesApi.listInstances(),
        scopesApi.getStatus().catch(() => ({ scopes: [] })),
      ]);
      setTemplates(tRes.templates);
      setInstances(iRes.instances);
      setStatuses(sRes.scopes);
    } catch (err) {
      console.error("Failed to load scopes:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusMap = new Map(statuses.map((s) => [s.name, s]));

  // ── Filtered lists ─────────────────────────────────────────────────────
  const filteredInstances = instances.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.scopeName.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredTemplates = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Create instance handler (auto-create + navigate) ─────────────────
  async function quickCreateFromTemplate(template: ScopeTemplate) {
    if (creating) return;
    setCreating(template.id);
    try {
      // Find next available index for duplicate names
      const baseName = template.name;
      const baseSlug = template.slug;
      const existing = instances.filter((i) => i.scopeName === baseSlug || i.scopeName.match(new RegExp(`^${baseSlug}-\\d+$`)));
      const idx = existing.length;
      const name = idx === 0 ? baseName : `${baseName} ${idx + 1}`;
      const scopeName = idx === 0 ? baseSlug : `${baseSlug}-${idx + 1}`;

      const { instance } = await scopesApi.createInstance({
        templateId: template.id,
        name,
        scopeName,
      });
      load();
      onNavigateToInstance?.(instance.id);
    } catch (err: any) {
      console.error("Failed to create instance:", err);
      setCreateError(err.message || "Failed to create instance");
      setTimeout(() => setCreateError(""), 5000);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <PuzzleIcon className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Scopes</h1>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab("instances")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "instances" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            My Instances
          </button>
          <button
            onClick={() => setTab("templates")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "templates" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Templates
          </button>
          <button
            onClick={() => setTab("developer")}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "developer" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Developer
          </button>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 w-52"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : tab === "instances" ? (
          <InstancesList
            instances={filteredInstances}
            statusMap={statusMap}
            onNavigate={onNavigateToInstance}
            onRefresh={load}
          />
        ) : tab === "templates" ? (
          <TemplatesList
            templates={filteredTemplates}
            onCreateFrom={quickCreateFromTemplate}
            creatingId={creating}
            onNavigate={onNavigateToTemplate}
          />
        ) : (
          <DeveloperTab onRegistered={load} />
        )}
      </div>

      {/* Error toast */}
      {createError && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-card shadow-lg animate-in slide-in-from-bottom-4 fade-in duration-200 max-w-sm">
          <XCircleIcon className="size-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
          <button onClick={() => setCreateError("")} className="p-0.5 text-muted-foreground hover:text-foreground ml-auto shrink-0">
            <XCircleIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Instances List ───────────────────────────────────────────────────────────

function ContainerStatusBadge({ status, connected }: { status: string; connected?: boolean }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    running: { icon: <CheckCircle2Icon className="size-3" />, label: connected ? "Connected" : "Running", cls: connected ? "text-green-600" : "text-blue-500" },
    starting: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Starting", cls: "text-blue-500" },
    building: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Building", cls: "text-amber-500" },
    stopped: { icon: <XCircleIcon className="size-3" />, label: "Stopped", cls: "text-muted-foreground" },
    error: { icon: <XCircleIcon className="size-3" />, label: "Error", cls: "text-red-500" },
    removing: { icon: <Loader2Icon className="size-3 animate-spin" />, label: "Removing", cls: "text-muted-foreground" },
  };
  const cfg = configs[status] ?? configs.stopped;
  return <span className={cn("flex items-center gap-1 text-xs", cfg.cls)}>{cfg.icon} {cfg.label}</span>;
}

function DeploymentTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = { "built-in": "Built-in", platform: "Platform", custom: "Custom", external: "External" };
  return (
    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
      {labels[type] ?? type}
    </span>
  );
}

function InstancesList({
  instances,
  statusMap,
  onNavigate,
  onRefresh,
}: {
  instances: ScopeInstance[];
  statusMap: Map<string, CoreScopeStatus>;
  onNavigate?: (id: string) => void;
  onRefresh: () => void;
}) {
  if (instances.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <PuzzleIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">No scope instances yet.</p>
        <p className="text-xs mt-1">Browse templates to create one.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {instances.map((inst) => {
        const coreStatus = statusMap.get(inst.scopeName);
        const connected = coreStatus?.connected ?? false;
        const containerStatus = inst.containerStatus ?? "stopped";
        const isRunning = containerStatus === "running";

        return (
          <button
            key={inst.id}
            onClick={() => onNavigate?.(inst.id)}
            className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/50 transition-colors text-left group w-full"
          >
            <div className={cn(
              "flex items-center justify-center size-10 rounded-lg",
              isRunning && connected ? "bg-green-500/10 text-green-600"
                : isRunning ? "bg-blue-500/10 text-blue-500"
                : "bg-muted text-muted-foreground",
            )}>
              <ScopeIcon icon={inst.template.icon} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{inst.name}</span>
                <span className="text-xs text-muted-foreground font-mono">({inst.scopeName})</span>
                <DeploymentTypeBadge type={inst.deploymentType} />
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-xs text-muted-foreground">{inst.template.name}</span>
                {inst.active ? (
                  <ContainerStatusBadge status={containerStatus} connected={connected} />
                ) : (
                  <span className="text-xs text-muted-foreground">Inactive</span>
                )}
                {inst.statusMessage && (
                  <span className="text-[10px] text-red-400 truncate max-w-48">{inst.statusMessage}</span>
                )}
              </div>
            </div>

            <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      })}
    </div>
  );
}

// ── Templates List ───────────────────────────────────────────────────────────

function TemplatesList({
  templates,
  onCreateFrom,
  creatingId,
  onNavigate,
}: {
  templates: ScopeTemplate[];
  onCreateFrom: (t: ScopeTemplate) => void;
  creatingId?: string | null;
  onNavigate?: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No templates available.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((tmpl) => (
        <div
          key={tmpl.id}
          className="flex flex-col p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
              <ScopeIcon icon={tmpl.icon} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm">{tmpl.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tmpl.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <WrenchIcon className="size-3" /> {tmpl.tools.length} tools
            </span>
            {tmpl.requiredProfileFields.length > 0 && (
              <span>Requires: {tmpl.requiredProfileFields.join(", ")}</span>
            )}
            <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium uppercase">
              {tmpl.category}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <button
              onClick={() => onNavigate?.(tmpl.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              View Details
            </button>
            <div className="flex-1" />
            <button
              onClick={() => onCreateFrom(tmpl)}
              disabled={!!creatingId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creatingId === tmpl.id ? <Loader2Icon className="size-3 animate-spin" /> : <PlusIcon className="size-3" />}
              {creatingId === tmpl.id ? "Creating..." : "Add"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Developer Tab ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <CheckIcon className="size-3.5 text-green-400" /> : <CopyIcon className="size-3.5 text-zinc-400" />}
    </button>
  );
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50">
        <span className="text-[10px] text-zinc-500 font-mono">{lang ?? "bash"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="p-3 text-xs text-zinc-300 overflow-x-auto font-mono leading-relaxed whitespace-pre">{code}</pre>
    </div>
  );
}

function DeveloperTab({ onRegistered }: { onRegistered: () => void }) {
  const [activeSection, setActiveSection] = useState<"cli" | "register">("cli");

  return (
    <div className="max-w-3xl space-y-6">
      {/* Hero */}
      <div className="flex items-start gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          <CodeIcon className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-base">Build Your Own Scope</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Give your haseefs new capabilities by building a custom scope.
            Use the CLI to scaffold, develop, and deploy — or register a scope you've already deployed.
          </p>
        </div>
      </div>

      {/* Section Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection("cli")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeSection === "cli"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <TerminalIcon className="size-4" /> Build with CLI
        </button>
        <button
          onClick={() => setActiveSection("register")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
            activeSection === "register"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <GlobeIcon className="size-4" /> Register Deployed Scope
        </button>
      </div>

      {activeSection === "cli" ? <CLIGuide /> : <RegisterSection onRegistered={onRegistered} />}
    </div>
  );
}

// ── CLI Guide ────────────────────────────────────────────────────────────────

function CLIGuide() {
  return (
    <div className="space-y-6">
      {/* Step 1: Install CLI */}
      <section className="space-y-3">
        <StepHeader n={1} title="Install the Hsafa CLI" />
        <div className="pl-8">
          <CodeBlock code="npm install -g @hsafa/cli" />
        </div>
      </section>

      {/* Step 2: Authenticate */}
      <section className="space-y-3">
        <StepHeader n={2} title="Authenticate" />
        <div className="pl-8 space-y-2">
          <CodeBlock code={`# Login with your account
hsafa auth login

# Or use an API key directly
hsafa auth login --api-key YOUR_API_KEY`} />
          <p className="text-xs text-muted-foreground">
            Get your API key from <span className="font-medium text-foreground">Settings → API Keys</span>.
            The CLI stores your credentials locally in <code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">~/.hsafa/config.json</code>.
          </p>
        </div>
      </section>

      {/* Step 3: Init project */}
      <section className="space-y-3">
        <StepHeader n={3} title="Scaffold a New Scope" />
        <div className="pl-8 space-y-2">
          <CodeBlock code={`# Create a new scope project
hsafa scope init my-weather-scope

# This creates:
#   my-weather-scope/
#     src/index.ts      ← entry point (SDK + tools + handlers)
#     src/tools.ts      ← tool definitions
#     src/handler.ts    ← your business logic
#     package.json
#     .env
#     tsconfig.json`} />
        </div>
      </section>

      {/* Step 4: Template code */}
      <section className="space-y-3">
        <StepHeader n={4} title="Write Your Logic" />
        <p className="text-sm text-muted-foreground pl-8">
          The generated <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">src/index.ts</code> is
          a complete working starter. Here's what it looks like — tools are registered automatically when your service starts:
        </p>
        <div className="pl-8">
          <CodeBlock lang="src/index.ts" code={`import { HsafaSDK } from "@hsafa/sdk";

// ── Config ──────────────────────────────────────────────────
const SCOPE_NAME = process.env.SCOPE_NAME || "my-weather-scope";
const CORE_URL   = process.env.CORE_URL   || "http://localhost:3001";
const API_KEY    = process.env.API_KEY     || "";

const sdk = new HsafaSDK({
  coreUrl: CORE_URL,
  apiKey: API_KEY,
  scope: SCOPE_NAME,
});

// ── Tools — registered automatically on startup ─────────────
await sdk.registerTools([
  {
    name: "get_weather",
    description: "Get current weather for a city",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
      },
      required: ["city"],
    },
  },
  {
    name: "get_forecast",
    description: "Get 5-day weather forecast",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name" },
        days: { type: "number", description: "Number of days (1-5)" },
      },
      required: ["city"],
    },
  },
]);

// ── Handlers — your custom logic ────────────────────────────
sdk.onToolCall("get_weather", async (args, ctx) => {
  const { city } = args;
  // Replace with your actual API call
  const res = await fetch(
    \`https://api.weather.example/current?city=\${city}\`
  );
  const data = await res.json();
  return { city, temperature: data.temp, condition: data.condition };
});

sdk.onToolCall("get_forecast", async (args, ctx) => {
  const { city, days = 5 } = args;
  // Replace with your actual API call
  const res = await fetch(
    \`https://api.weather.example/forecast?city=\${city}&days=\${days}\`
  );
  return await res.json();
});

// ── Connect — starts SSE listener for tool calls ────────────
sdk.connect();
console.log(\`[\${SCOPE_NAME}] Connected to Core — ready for tool calls\`);`} />
        </div>
      </section>

      {/* Step 5: Configure .env */}
      <section className="space-y-3">
        <StepHeader n={5} title="Configure .env" />
        <div className="pl-8 space-y-2">
          <CodeBlock lang=".env" code={`SCOPE_NAME=my-weather-scope
CORE_URL=http://localhost:3001
API_KEY=your_api_key_here`} />
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              <strong>Important:</strong> The <code className="bg-amber-500/10 px-1 rounded font-mono">SCOPE_NAME</code> must
              match the scope name you register here. The <code className="bg-amber-500/10 px-1 rounded font-mono">API_KEY</code> is
              your Core API key from Settings → API Keys.
            </p>
          </div>
        </div>
      </section>

      {/* Step 6: Deploy */}
      <section className="space-y-3">
        <StepHeader n={6} title="Deploy & Register" />
        <div className="pl-8 space-y-3">
          <p className="text-sm text-muted-foreground">
            Deploy your scope using the CLI. This registers it automatically and starts accepting tool calls:
          </p>
          <CodeBlock code={`# Deploy to the Hsafa platform (auto-registers scope + tools)
hsafa scope deploy

# Or run locally during development
npx tsx src/index.ts`} />
          <p className="text-xs text-muted-foreground">
            When you run <code className="bg-muted px-1 rounded font-mono">hsafa scope deploy</code>, it:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
            <li>Registers the scope name in the platform</li>
            <li>Calls <code className="bg-muted px-1 rounded font-mono">sdk.registerTools()</code> to sync your tools with Core</li>
            <li>Connects via SSE to start receiving tool calls</li>
            <li>The scope appears in <strong className="text-foreground">My Instances</strong> — ready to attach to haseefs</li>
          </ul>
        </div>
      </section>

      {/* Step 7: Attach */}
      <section className="space-y-3">
        <StepHeader n={7} title="Attach to Haseefs" />
        <div className="pl-8 space-y-2">
          <CodeBlock code={`# Attach via CLI
hsafa scope attach --haseef <haseef-id>`} />
          <p className="text-xs text-muted-foreground">
            Or go to <strong className="text-foreground">Haseefs → (your haseef) → Scopes tab → Attach</strong> in the UI.
            Once attached, the haseef sees your tools and can call them.
          </p>
        </div>
      </section>

      {/* Python / other languages */}
      <section className="p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <TerminalIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">Other Languages</p>
            <p className="text-xs text-muted-foreground mt-1">
              You can build scopes in <strong>Python</strong>, <strong>Go</strong>, or any language.
              The protocol is simple: HTTP to register tools, SSE to receive tool calls, HTTP to post results.
              Use <code className="bg-muted px-1 rounded font-mono text-[10px]">hsafa scope init --lang python</code> for a Python starter.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Register Deployed Scope Section ──────────────────────────────────────────

function RegisterSection({ onRegistered }: { onRegistered: () => void }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <ExternalLinkIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Already deployed your scope?</p>
            <p className="text-xs text-muted-foreground">
              If you've built and deployed a scope service that connects to Core using the SDK,
              register it here so it appears in the UI. You'll need:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li><strong className="text-foreground">Scope Name</strong> — the exact name used in your <code className="bg-muted px-1 rounded font-mono">new HsafaSDK({"{"} scope: "..." {"}"})</code> config</li>
              <li><strong className="text-foreground">API Key</strong> — the same Core API key your service uses to authenticate</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              After registration, the scope will appear in <strong className="text-foreground">My Instances</strong> and can be attached/detached from haseefs.
              Tools are registered automatically by your service via <code className="bg-muted px-1 rounded font-mono">sdk.registerTools()</code>.
            </p>
          </div>
        </div>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors w-full justify-center"
        >
          <PlusIcon className="size-4" /> Register External Scope
        </button>
      ) : (
        <RegisterExternalForm
          onClose={() => setShowForm(false)}
          onRegistered={() => { setShowForm(false); onRegistered(); }}
        />
      )}
    </div>
  );
}

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">{n}</div>
      <h3 className="font-semibold text-sm">{title}</h3>
    </div>
  );
}

// ── Register External Scope Form ─────────────────────────────────────────────

function RegisterExternalForm({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [scopeName, setScopeName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    setError("");
    if (!scopeName.trim()) { setError("Scope name is required"); return; }
    if (!displayName.trim()) { setError("Display name is required"); return; }
    if (!apiKey.trim()) { setError("API key is required"); return; }
    if (!/^[a-z][a-z0-9_-]{1,48}$/.test(scopeName)) {
      setError("Scope name must be lowercase, start with a letter, and only contain a-z, 0-9, _, -");
      return;
    }

    setSubmitting(true);
    try {
      await scopesApi.registerExternal({
        scopeName: scopeName.trim(),
        displayName: displayName.trim(),
        apiKey: apiKey.trim(),
        description: description.trim() || undefined,
      });
      onRegistered();
    } catch (err: any) {
      setError(err.message || "Failed to register scope");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Scope Name</label>
        <p className="text-[10px] text-muted-foreground mb-1">
          The exact <code className="bg-muted px-1 rounded font-mono">scope</code> value used in your <code className="bg-muted px-1 rounded font-mono">new HsafaSDK({"{"} scope: "..." {"}"})</code>
        </p>
        <input
          type="text"
          value={scopeName}
          onChange={(e) => setScopeName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="my-weather-scope"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Display Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="My Weather Scope"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Core API Key
        </label>
        <p className="text-[10px] text-muted-foreground mb-1">
          The same API key your service uses to connect to Core. Used to verify ownership.
        </p>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="your_api_key_here"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          rows={2}
          placeholder="What does this scope do?"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2Icon className="size-4 animate-spin" />}
          Register
        </button>
      </div>
    </div>
  );
}

