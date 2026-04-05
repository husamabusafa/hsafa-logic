import { useState, useEffect, useCallback } from "react";
import {
  PuzzleIcon,
  PlusIcon,
  XIcon,
  CheckCircle2Icon,
  XCircleIcon,
  Loader2Icon,
  AlertTriangleIcon,
  MessageSquareIcon,
  CalendarIcon,
  PlugIcon,
  DatabaseIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { scopesApi, type ScopeInstance } from "@/lib/api";

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

interface HaseefScopesTabProps {
  haseefId: string;
  profileJson?: Record<string, unknown>;
}

export function HaseefScopesTab({ haseefId, profileJson }: HaseefScopesTabProps) {
  const [attachedInstances, setAttachedInstances] = useState<ScopeInstance[]>([]);
  const [allInstances, setAllInstances] = useState<ScopeInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [detaching, setDetaching] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAttachPicker, setShowAttachPicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, iRes] = await Promise.all([
        scopesApi.listHaseefScopes(haseefId),
        scopesApi.listInstances(),
      ]);
      setAttachedInstances(hRes.instances);
      setAllInstances(iRes.instances);
    } catch (err) {
      console.error("Failed to load haseef scopes:", err);
    } finally {
      setLoading(false);
    }
  }, [haseefId]);

  useEffect(() => { load(); }, [load]);

  const attachedScopeNames = new Set(attachedInstances.map((i) => i.scopeName));
  const availableInstances = allInstances.filter(
    (i) => i.active && !attachedScopeNames.has(i.scopeName),
  );

  async function handleAttach(instanceId: string) {
    setError("");
    setAttaching(instanceId);
    try {
      await scopesApi.attachScope(haseefId, instanceId);
      await load();
      setShowAttachPicker(false);
    } catch (err: any) {
      setError(err.message || "Failed to attach scope");
    } finally {
      setAttaching(null);
    }
  }

  async function handleDetach(scopeName: string) {
    setError("");
    setDetaching(scopeName);
    try {
      await scopesApi.detachScope(haseefId, scopeName);
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to detach scope");
    } finally {
      setDetaching(null);
    }
  }

  // Check if a scope's required profile fields are satisfied
  function checkProfileFields(requiredFields: string[]): { valid: boolean; missing: string[] } {
    if (!requiredFields || requiredFields.length === 0) return { valid: true, missing: [] };
    const profile = profileJson ?? {};
    const missing = requiredFields.filter((f) => !profile[f]);
    return { valid: missing.length === 0, missing };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Attached Scopes */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Attached Scopes ({attachedInstances.length})</h3>
        <button
          onClick={() => setShowAttachPicker(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
        >
          <PlusIcon className="size-3" /> Attach Scope
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-2 rounded-lg">{error}</p>
      )}

      {attachedInstances.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
          <PuzzleIcon className="size-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No scopes attached yet.</p>
          <p className="text-xs mt-1">Attach scopes to give this haseef new capabilities.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachedInstances.map((inst) => (
            <div
              key={inst.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
            >
              <div className={cn(
                "flex items-center justify-center size-9 rounded-lg",
                inst.connected ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground",
              )}>
                <ScopeIcon icon={inst.template.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{inst.name}</span>
                  <span className="text-[10px] font-mono text-muted-foreground">({inst.scopeName})</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{inst.template.name}</span>
                  <span className="flex items-center gap-1 text-xs">
                    {inst.connected ? (
                      <><CheckCircle2Icon className="size-3 text-green-500" /> Connected</>
                    ) : (
                      <><XCircleIcon className="size-3 text-yellow-500" /> Disconnected</>
                    )}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDetach(inst.scopeName)}
                disabled={detaching === inst.scopeName}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-50"
                title="Detach scope"
              >
                {detaching === inst.scopeName ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <XIcon className="size-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Attach Picker Modal */}
      {showAttachPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowAttachPicker(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-semibold">Attach Scope</h3>
              <button onClick={() => setShowAttachPicker(false)} className="p-1 rounded-lg hover:bg-muted">
                <XIcon className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {availableInstances.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No additional scopes available.</p>
                  <p className="text-xs mt-1">All active scope instances are already attached.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableInstances.map((inst) => {
                    const requiredFields = inst.template.requiredProfileFields ?? [];
                    const { valid, missing } = checkProfileFields(requiredFields);

                    return (
                      <div
                        key={inst.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl border bg-card transition-colors",
                          valid ? "border-border hover:border-primary/30" : "border-yellow-300/50",
                        )}
                      >
                        <div className="flex items-center justify-center size-9 rounded-lg bg-muted text-muted-foreground">
                          <ScopeIcon icon={inst.template.icon} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{inst.name}</p>
                          <p className="text-xs text-muted-foreground">{inst.template.name}</p>
                          {!valid && (
                            <p className="flex items-center gap-1 text-[10px] text-yellow-600 mt-1">
                              <AlertTriangleIcon className="size-3" />
                              Missing profile: {missing.join(", ")}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleAttach(inst.id)}
                          disabled={!valid || attaching === inst.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {attaching === inst.id ? (
                            <Loader2Icon className="size-3 animate-spin" />
                          ) : (
                            <PlusIcon className="size-3" />
                          )}
                          Attach
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
