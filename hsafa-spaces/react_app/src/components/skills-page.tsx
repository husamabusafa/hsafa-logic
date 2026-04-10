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
  TerminalIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  GlobeIcon,
  DatabaseIcon,
  SparklesIcon,
  CodeIcon,
  ZapIcon,
  ArrowLeftIcon,
  FolderTreeIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  scopesApi,
  type ScopeTemplate,
  type ScopeInstance,
  type CoreScopeStatus,
} from "@/lib/api";

// ── Icon resolver ────────────────────────────────────────────────────────────

function SkillIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = cn("size-5", className);
  switch (icon) {
    case "MessageSquare": return <MessageSquareIcon className={cls} />;
    case "Calendar": return <CalendarIcon className={cls} />;
    case "Database": return <DatabaseIcon className={cls} />;
    case "Plug": return <PlugIcon className={cls} />;
    default: return <PuzzleIcon className={cls} />;
  }
}

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, connected }: { status: string; connected?: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
        <span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
        Connected
      </span>
    );
  }
  const configs: Record<string, { label: string; dotCls: string; textCls: string }> = {
    running: { label: "Running", dotCls: "bg-blue-500 animate-pulse", textCls: "text-blue-600" },
    starting: { label: "Starting", dotCls: "bg-amber-500 animate-pulse", textCls: "text-amber-600" },
    building: { label: "Building", dotCls: "bg-amber-500 animate-pulse", textCls: "text-amber-600" },
    stopped: { label: "Stopped", dotCls: "bg-zinc-400", textCls: "text-muted-foreground" },
    error: { label: "Error", dotCls: "bg-red-500", textCls: "text-red-500" },
  };
  const cfg = configs[status] ?? configs.stopped;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", cfg.textCls)}>
      <span className={cn("size-1.5 rounded-full", cfg.dotCls)} />
      {cfg.label}
    </span>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

type View = "list" | "add";

interface SkillsPageProps {
  onNavigateToInstance?: (instanceId: string) => void;
}

export function SkillsPage({ onNavigateToInstance }: SkillsPageProps) {
  const [view, setView] = useState<View>("list");
  const [instances, setInstances] = useState<ScopeInstance[]>([]);
  const [statuses, setStatuses] = useState<CoreScopeStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, sRes] = await Promise.all([
        scopesApi.listInstances(),
        scopesApi.getStatus().catch(() => ({ scopes: [] })),
      ]);
      setInstances(iRes.instances);
      setStatuses(sRes.scopes);
    } catch (err) {
      console.error("Failed to load skills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const statusMap = new Map(statuses.map((s) => [s.name, s]));

  if (view === "add") {
    return (
      <AddSkillView
        onBack={() => setView("list")}
        onCreated={(id) => { setView("list"); load(); onNavigateToInstance?.(id); }}
        onRegistered={() => { setView("list"); load(); }}
        existingInstances={instances}
      />
    );
  }

  const filtered = instances.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.scopeName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <ZapIcon className="size-6 text-primary" />
          <h1 className="text-xl font-semibold">Skills</h1>
          <span className="text-sm text-muted-foreground">{instances.length}</span>
        </div>
        <button
          onClick={() => setView("add")}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusIcon className="size-4" />
          Add Skill
        </button>
      </div>

      {/* Search (only if there are skills) */}
      {instances.length > 0 && (
        <div className="px-6 py-3 border-b border-border">
          <div className="relative max-w-sm">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search skills..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 && !search ? (
          <EmptyState onAdd={() => setView("add")} />
        ) : filtered.length === 0 && search ? (
          <div className="text-center py-12 text-muted-foreground">
            <SearchIcon className="size-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No skills matching "{search}"</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((inst) => {
              const coreStatus = statusMap.get(inst.scopeName);
              const connected = coreStatus?.connected ?? false;
              const isBuiltIn = inst.deploymentType === "built-in" || !!(inst as any).builtIn;
              const containerStatus = isBuiltIn ? "running" : (inst.containerStatus ?? "stopped");
              const isRunning = containerStatus === "running";
              const toolCount = inst.template?.tools?.length ?? 0;

              return (
                <button
                  key={inst.id}
                  onClick={() => onNavigateToInstance?.(inst.id)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary/30 hover:bg-muted/30 transition-all text-left group w-full"
                >
                  <div className={cn(
                    "flex items-center justify-center size-11 rounded-xl shrink-0",
                    isBuiltIn || (isRunning && connected) ? "bg-green-500/10 text-green-600"
                      : isRunning ? "bg-blue-500/10 text-blue-500"
                      : "bg-muted text-muted-foreground",
                  )}>
                    <SkillIcon icon={inst.template.icon} className="size-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{inst.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">({inst.scopeName})</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {isBuiltIn ? (
                        <StatusBadge status="running" connected />
                      ) : (
                        <StatusBadge status={containerStatus} connected={connected} />
                      )}
                      {toolCount > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <WrenchIcon className="size-3" />
                          {toolCount} tool{toolCount !== 1 ? "s" : ""}
                        </span>
                      )}
                      {inst.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-64">{inst.description}</span>
                      )}
                    </div>
                  </div>

                  <ChevronRightIcon className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="size-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
        <ZapIcon className="size-8 text-primary" />
      </div>
      <h2 className="text-lg font-semibold mb-1">No skills yet</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
        Skills give your haseefs new abilities — connect to databases, send messages, access APIs, and more.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        <PlusIcon className="size-4" />
        Add Your First Skill
      </button>

      <div className="mt-8 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-mono">
        <TerminalIcon className="size-3.5 text-zinc-500" />
        hsafa skill init my-first-skill
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">or use the CLI to scaffold a custom skill</p>
    </div>
  );
}

// ── Add Skill View (Full Page) ───────────────────────────────────────────────

function AddSkillView({
  onBack,
  onCreated,
  onRegistered,
  existingInstances,
}: {
  onBack: () => void;
  onCreated: (instanceId: string) => void;
  onRegistered: () => void;
  existingInstances: ScopeInstance[];
}) {
  const [tab, setTab] = useState<"marketplace" | "developer">("marketplace");
  const [templates, setTemplates] = useState<ScopeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { templates: t } = await scopesApi.listTemplates();
        setTemplates(t);
      } catch (err) {
        console.error("Failed to load marketplace:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredTemplates = templates.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.toLowerCase().includes(search.toLowerCase()),
  );

  async function installSkill(template: ScopeTemplate) {
    if (creating) return;
    setCreating(template.id);
    setError("");
    try {
      const baseSlug = template.slug;
      const existing = existingInstances.filter((i) => i.scopeName === baseSlug || i.scopeName.match(new RegExp(`^${baseSlug}-\\d+$`)));
      const idx = existing.length;
      const name = idx === 0 ? template.name : `${template.name} ${idx + 1}`;
      const scopeName = idx === 0 ? baseSlug : `${baseSlug}-${idx + 1}`;

      const { instance } = await scopesApi.createInstance({
        templateId: template.id,
        name,
        scopeName,
      });
      onCreated(instance.id);
    } catch (err: any) {
      setError(err.message || "Failed to install skill");
      setTimeout(() => setError(""), 5000);
    } finally {
      setCreating(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ArrowLeftIcon className="size-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold">Add Skill</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Choose from the marketplace or build your own</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <div className="flex gap-1 bg-muted rounded-lg p-0.5">
          <button
            onClick={() => setTab("marketplace")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "marketplace" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SparklesIcon className="size-4" />
            Marketplace
          </button>
          <button
            onClick={() => setTab("developer")}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              tab === "developer" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <CodeIcon className="size-4" />
            Developer
          </button>
        </div>

        {tab === "marketplace" && (
          <>
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
          </>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
          <XCircleIcon className="size-3.5 text-red-500 shrink-0" />
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "marketplace" ? (
          <MarketplaceGrid
            templates={filteredTemplates}
            loading={loading}
            search={search}
            onInstall={installSkill}
            creatingId={creating}
          />
        ) : (
          <DeveloperTab onRegistered={onRegistered} />
        )}
      </div>
    </div>
  );
}

// ── Marketplace Grid ─────────────────────────────────────────────────────────

function MarketplaceGrid({
  templates,
  loading,
  search,
  onInstall,
  creatingId,
}: {
  templates: ScopeTemplate[];
  loading: boolean;
  search: string;
  onInstall: (t: ScopeTemplate) => void;
  creatingId: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <SparklesIcon className="size-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">{search ? `No skills matching "${search}"` : "No marketplace skills available yet."}</p>
        <p className="text-xs mt-1">Skills you deploy will appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((tmpl) => (
        <div
          key={tmpl.id}
          className="flex flex-col p-4 rounded-xl border border-border bg-card hover:border-primary/20 transition-colors"
        >
          <div className="flex items-start gap-3">
            <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10 text-primary shrink-0">
              <SkillIcon icon={tmpl.icon} />
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
            <div className="flex-1" />
            <button
              onClick={() => onInstall(tmpl)}
              disabled={!!creatingId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creatingId === tmpl.id ? <Loader2Icon className="size-3 animate-spin" /> : <PlusIcon className="size-3" />}
              {creatingId === tmpl.id ? "Adding..." : "Add"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Developer Tab ────────────────────────────────────────────────────────────

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
          <h2 className="font-semibold text-base">Build Your Own Skill</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Give your haseefs new capabilities by building a custom skill.
            Use the CLI to scaffold, develop, and deploy — or register a skill you've already deployed.
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
          <GlobeIcon className="size-4" /> Register Deployed Skill
        </button>
      </div>

      {activeSection === "cli" ? <CLIGuide /> : <RegisterSection onRegistered={onRegistered} />}
    </div>
  );
}

// ── CLI Guide (full version) ─────────────────────────────────────────────────

function CLIGuide() {
  return (
    <div className="space-y-8">
      {/* Step 1: Install CLI */}
      <section className="space-y-3">
        <StepHeader n={1} title="Install the Hsafa CLI" />
        <div className="pl-9">
          <CodeBlock code="npm install -g @hsafa/cli" />
        </div>
      </section>

      {/* Step 2: Authenticate */}
      <section className="space-y-3">
        <StepHeader n={2} title="Authenticate" />
        <div className="pl-9 space-y-3">
          <CodeBlock code={`# Login with your account
hsafa auth login

# Or use an API key directly
hsafa auth login --api-key YOUR_API_KEY`} />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Get your API key from <span className="font-medium text-foreground">Settings → API Keys</span>.
            The CLI stores your credentials locally in <code className="text-[11px] bg-zinc-800/60 text-zinc-300 px-1.5 py-0.5 rounded font-mono">~/.hsafa/config.json</code>.
          </p>
        </div>
      </section>

      {/* Step 3: Init project */}
      <section className="space-y-3">
        <StepHeader n={3} title="Scaffold a New Skill" />
        <div className="pl-9 space-y-3">
          <CodeBlock code={`# Create a new skill project
hsafa skill init my-weather-skill

# This creates:
#   my-weather-skill/
#     src/index.ts      ← entry point (SDK + tools + handlers)
#     src/tools.ts      ← tool definitions
#     src/handler.ts    ← your business logic
#     package.json
#     Dockerfile
#     tsconfig.json`} />
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
            <FolderTreeIcon className="size-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground">
              The scaffolded project is a complete working starter — edit and run immediately.
            </p>
          </div>
        </div>
      </section>

      {/* Step 4: Template code */}
      <section className="space-y-3">
        <StepHeader n={4} title="Write Your Logic" />
        <p className="text-sm text-muted-foreground pl-9 leading-relaxed">
          The scaffold splits code into <code className="text-[11px] bg-zinc-800/60 text-zinc-300 px-1.5 py-0.5 rounded font-mono">src/tools.ts</code>,{" "}
          <code className="text-[11px] bg-zinc-800/60 text-zinc-300 px-1.5 py-0.5 rounded font-mono">src/handler.ts</code>, and{" "}
          <code className="text-[11px] bg-zinc-800/60 text-zinc-300 px-1.5 py-0.5 rounded font-mono">src/index.ts</code>.
          Here's a simplified single-file view of how it works:
        </p>
        <div className="pl-9">
          <CodeBlock lang="src/index.ts" code={`import { HsafaSDK } from "@hsafa/sdk";

// ── Config (auto-injected by the platform at deploy) ────────
const sdk = new HsafaSDK({
  coreUrl: process.env.CORE_URL!,
  apiKey: process.env.SCOPE_KEY!,
  scope: process.env.SCOPE_NAME!,
});

// ── Register tools ──────────────────────────────────────────
await sdk.registerTools([
  {
    name: "get_weather",
    description: "Get current weather for a city",
    input: { city: "string" },
  },
]);

// ── Handle tool calls ───────────────────────────────────────
sdk.onToolCall("get_weather", async (args, ctx) => {
  const res = await fetch(
    \`https://api.weather.example/current?city=\${args.city}\`
  );
  return await res.json();
});

// ── Push events — notify haseefs proactively ────────────────
async function alertHaseef(city: string, alert: string) {
  await sdk.pushEvent({
    type: "weather_alert",
    data: { city, alert },
    target: { phone: "+966501234567" },
  });
}

// ── Connect — starts SSE listener for tool calls ────────────
sdk.connect();`} />
        </div>
      </section>

      {/* Step 5: Deploy */}
      <section className="space-y-3">
        <StepHeader n={5} title="Deploy" />
        <div className="pl-9 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Deploy your skill to the platform. The CLI builds a Docker image, pushes it, and makes it available:
          </p>
          <CodeBlock code={`# Deploy to the Hsafa platform
hsafa skill deploy`} />
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
            <p className="text-xs text-muted-foreground font-medium">
              When you run <code className="text-[11px] bg-zinc-800/60 text-zinc-300 px-1.5 py-0.5 rounded font-mono">hsafa skill deploy</code>, it:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1.5 pl-1">
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> Builds a Docker image from your project</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> Pushes the image to the Hsafa registry</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> Registers your skill with tool definitions</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> The skill appears in <strong className="text-foreground">Marketplace</strong> — ready to add</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Step 6: Attach */}
      <section className="space-y-3">
        <StepHeader n={6} title="Attach to a Haseef" />
        <div className="pl-9 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Once added, go back to <strong className="text-foreground">Skills</strong> and click on your skill to configure and attach it to your haseefs.
          </p>
          <div className="p-3 rounded-lg bg-muted/40 border border-border space-y-2">
            <ul className="text-xs text-muted-foreground space-y-1.5 pl-1">
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> <strong className="text-foreground">Skills</strong> → select your skill → <strong className="text-foreground">Attach</strong> to a haseef</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500 mt-0.5">→</span> The haseef now has access to your skill's tools</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Python / other languages */}
      <section className="p-4 rounded-xl border border-border bg-linear-to-br from-muted/40 to-muted/20">
        <div className="flex items-start gap-3">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <GlobeIcon className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Other Languages</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              You can build skills in <strong className="text-foreground">Python</strong>, <strong className="text-foreground">Go</strong>, or any language.
              The protocol is simple: HTTP to register tools, SSE to receive tool calls, HTTP to post results.
            </p>
            <div className="mt-3">
              <CodeBlock code={`hsafa skill init --lang python    # Python starter
hsafa skill init --lang go         # Go starter`} />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Register Deployed Skill Section ──────────────────────────────────────────

function RegisterSection({ onRegistered }: { onRegistered: () => void }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border border-border bg-muted/30">
        <div className="flex items-start gap-3">
          <ExternalLinkIcon className="size-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Already deployed your skill?</p>
            <p className="text-xs text-muted-foreground">
              If you've built and deployed a skill service on your own server that connects to Core using the SDK,
              register it here so it appears in the UI. You'll need:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
              <li><strong className="text-foreground">Scope Key</strong> — the <code className="bg-muted px-1 rounded font-mono">hsk_scope_*</code> key assigned to your skill when it was created on Core</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              The skill name will be detected automatically from the key.
              After registration, the skill will appear in <strong className="text-foreground">Skills</strong> and can be attached to haseefs.
            </p>
          </div>
        </div>
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors w-full justify-center"
        >
          <PlusIcon className="size-4" /> Register Deployed Skill
        </button>
      ) : (
        <RegisterForm
          onClose={() => setShowForm(false)}
          onRegistered={() => { setShowForm(false); onRegistered(); }}
        />
      )}
    </div>
  );
}

// ── Register Form ────────────────────────────────────────────────────────────

function RegisterForm({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const [scopeKey, setScopeKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState<{ scopeName: string; connected: boolean; toolCount: number } | null>(null);

  async function handleVerify() {
    setError("");
    setVerified(null);
    if (!scopeKey.trim()) { setError("Scope key is required"); return; }
    setVerifying(true);
    try {
      const result = await scopesApi.verifyExternalScope(scopeKey.trim());
      setVerified({ scopeName: result.scopeName, connected: result.connected, toolCount: result.toolCount });
      if (!displayName.trim()) {
        setDisplayName(result.scopeName.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify scope key");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit() {
    setError("");
    if (!scopeKey.trim()) { setError("Scope key is required"); return; }
    if (!verified) { setError("Please verify the scope key first"); return; }
    if (!displayName.trim()) { setError("Display name is required"); return; }
    setSubmitting(true);
    try {
      await scopesApi.registerExternal({
        scopeName: verified.scopeName,
        displayName: displayName.trim(),
        scopeKey: scopeKey.trim(),
        description: description.trim() || undefined,
      });
      onRegistered();
    } catch (err: any) {
      setError(err.message || "Failed to register skill");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 rounded-xl border border-border bg-card space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          Scope Key
        </label>
        <p className="text-[10px] text-muted-foreground mb-1">
          The <code className="bg-muted px-1 rounded font-mono">hsk_scope_*</code> key your skill uses to connect to Core.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={scopeKey}
            onChange={(e) => { setScopeKey(e.target.value); setVerified(null); }}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-background font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="hsk_scope_..."
          />
          <button
            onClick={handleVerify}
            disabled={verifying || !scopeKey.trim()}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg font-medium transition-colors disabled:opacity-50 shrink-0",
              verified
                ? "bg-green-500/10 text-green-600 border border-green-300 dark:border-green-800"
                : "bg-muted text-foreground border border-border hover:bg-muted/80",
            )}
          >
            {verifying ? <Loader2Icon className="size-3.5 animate-spin" /> : verified ? <CheckCircle2Icon className="size-3.5" /> : <SearchIcon className="size-3.5" />}
            {verified ? "Verified" : "Verify"}
          </button>
        </div>
      </div>

      {verified && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-300 dark:border-green-800 space-y-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-3.5 text-green-600" />
            <span className="text-xs font-medium text-green-700 dark:text-green-400">Skill verified on Core</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground">Name:</span>{" "}
              <span className="font-mono font-medium">{verified.scopeName}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Status:</span>{" "}
              <span className={verified.connected ? "text-green-600 font-medium" : "text-muted-foreground"}>
                {verified.connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Tools:</span>{" "}
              <span className="font-medium">{verified.toolCount}</span>
            </div>
          </div>
        </div>
      )}

      {verified && (
        <>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="My Weather Skill"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              rows={2}
              placeholder="What does this skill do?"
            />
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !verified}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {submitting && <Loader2Icon className="size-4 animate-spin" />}
          Register Skill
        </button>
      </div>
    </div>
  );
}

// ── Shared Components ────────────────────────────────────────────────────────

function StepHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center justify-center size-7 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-sm">{n}</div>
      <h3 className="font-semibold text-[15px]">{title}</h3>
    </div>
  );
}

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

function highlightCode(code: string, lang: string): React.ReactNode[] {
  const lines = code.split("\n");
  return lines.map((line, i) => {
    let content: React.ReactNode = line;
    if (line.trimStart().startsWith("#") && lang !== "env") {
      content = <span className="text-zinc-500 italic">{line}</span>;
    } else if (lang === "env" || lang === ".env") {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/)
      if (m) content = <><span className="text-sky-400">{m[1]}</span><span className="text-zinc-500">=</span><span className="text-amber-300">{m[2]}</span></>;
    } else if (lang === "bash" || lang === "shell") {
      const parts: React.ReactNode[] = [];
      const tokens = line.match(/^(\s*)(\S+)(.*)/)
      if (tokens) {
        const [, ws, cmd, rest] = tokens;
        const keywords = ["npm", "npx", "hsafa", "cd", "echo", "mkdir", "pip", "docker"];
        parts.push(ws);
        if (keywords.some(k => cmd === k)) {
          parts.push(<span key="c" className="text-emerald-400 font-semibold">{cmd}</span>);
        } else {
          parts.push(cmd);
        }
        const highlighted = rest.replace(/(--[a-z-]+)/g, "\x00OPT$1\x00").replace(/("[^"]*")/g, "\x00STR$1\x00");
        highlighted.split("\x00").forEach((seg, j) => {
          if (seg.startsWith("OPT")) parts.push(<span key={`o${j}`} className="text-sky-400">{seg.slice(3)}</span>);
          else if (seg.startsWith("STR")) parts.push(<span key={`s${j}`} className="text-amber-300">{seg.slice(3)}</span>);
          else parts.push(seg);
        });
        content = <>{parts}</>;
      }
    } else if (lang?.includes("ts") || lang?.includes("index") || lang?.includes("typescript")) {
      const parts: React.ReactNode[] = [];
      const regex = /(import|from|const|let|var|async|await|export|function|return|new|if|else|switch|case|break|default|type|interface)(?=\s|[({;])|(\/\/.*$)|("[^"]*"|'[^']*'|`[^`]*`)|(\b\d+\.?\d*\b)/g;
      let last = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        if (match.index > last) parts.push(line.slice(last, match.index));
        if (match[1]) parts.push(<span key={match.index} className="text-purple-400 font-semibold">{match[1]}</span>);
        else if (match[2]) parts.push(<span key={match.index} className="text-zinc-500 italic">{match[2]}</span>);
        else if (match[3]) parts.push(<span key={match.index} className="text-amber-300">{match[3]}</span>);
        else if (match[4]) parts.push(<span key={match.index} className="text-orange-400">{match[4]}</span>);
        last = match.index + match[0].length;
      }
      if (last < line.length) parts.push(line.slice(last));
      content = parts.length ? <>{parts}</> : line;
    }
    return <div key={i} className="leading-relaxed">{content || " "}</div>;
  });
}

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const resolvedLang = lang ?? "bash";
  const isFile = lang?.includes(".") || lang?.includes("/");
  return (
    <div className="relative group rounded-xl bg-zinc-950 border border-zinc-800/80 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/60">
        <div className="flex items-center gap-2">
          {isFile ? (
            <FolderTreeIcon className="size-3 text-zinc-500" />
          ) : (
            <TerminalIcon className="size-3 text-zinc-500" />
          )}
          <span className="text-[11px] text-zinc-400 font-mono tracking-wide">{resolvedLang}</span>
        </div>
        <CopyButton text={code} />
      </div>
      <div className="flex">
        <div className="shrink-0 py-3 pl-3 pr-2 select-none border-r border-zinc-800/40">
          {code.split("\n").map((_, i) => (
            <div key={i} className="text-[10px] text-zinc-700 leading-relaxed text-right font-mono min-w-6">{i + 1}</div>
          ))}
        </div>
        <pre className="flex-1 p-3 text-[13px] text-zinc-300 overflow-x-auto font-mono">
          {highlightCode(code, resolvedLang)}
        </pre>
      </div>
    </div>
  );
}
