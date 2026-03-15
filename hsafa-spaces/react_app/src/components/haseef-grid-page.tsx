import { useNavigate } from "react-router-dom";
import {
  PlusIcon,
  BotIcon,
  CpuIcon,
  LoaderIcon,
  CalendarIcon,
  ActivityIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HaseefListItem } from "@/lib/api";

// ─── Grid Page ───────────────────────────────────────────────────────────────

interface HaseefsGridPageProps {
  haseefs: HaseefListItem[];
  isLoading: boolean;
}

export function HaseefsGridPage({ haseefs, isLoading }: HaseefsGridPageProps) {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Haseefs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your AI agents
            </p>
          </div>
          <Button onClick={() => navigate("/haseefs/new")}>
            <PlusIcon className="size-4" />
            New Haseef
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderIcon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : haseefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <BotIcon className="size-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No haseefs yet</h3>
            <p className="text-sm text-muted-foreground max-w-xs mb-4">
              Create your first AI agent to get started.
            </p>
            <Button onClick={() => navigate("/haseefs/new")}>
              <PlusIcon className="size-4" />
              Create Haseef
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {haseefs.map((h) => (
              <button
                key={h.haseefId}
                onClick={() => navigate(`/haseefs/${h.haseefId}`)}
                className="group text-left rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3.5">
                  {h.avatarUrl ? (
                    <img
                      src={h.avatarUrl}
                      alt={h.name}
                      className="size-12 rounded-xl object-cover shrink-0 border border-border"
                    />
                  ) : (
                    <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <BotIcon className="size-6 text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {h.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <CalendarIcon className="size-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Mini stats bar */}
                <div className="flex items-center gap-3 mt-4 pt-3 border-t border-border/60">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ActivityIcon className="size-3" />
                    <span>Active</span>
                  </div>
                  <div className="flex-1" />
                  <Badge variant="outline" className="text-[10px] gap-0.5">
                    <CpuIcon className="size-2.5" />
                    AI
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
