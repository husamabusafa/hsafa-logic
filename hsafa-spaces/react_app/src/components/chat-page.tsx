import { useState, useCallback, useMemo } from "react";
import {
  MenuIcon,
  PanelLeftIcon,
  LogOutIcon,
  MessageSquareIcon,
} from "lucide-react";
import { HsafaChatProvider, useCurrentSpace, useActiveAgents, useOnlineUsers, useMembers } from "@/lib/hsafa-ui";

import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { AuthSession } from "@/components/register-form";

const GATEWAY_URL = import.meta.env.VITE_HSAFA_GATEWAY_URL || "";
const PUBLIC_KEY = import.meta.env.VITE_HSAFA_PUBLIC_KEY || "";

function SpaceHeader() {
  const { spaceName } = useCurrentSpace();
  const activeAgents = useActiveAgents();
  const onlineUsers = useOnlineUsers();
  const { membersById, currentEntityId } = useMembers();

  // Running haseefs (agents with active runs)
  const runningAgents = activeAgents.filter(
    (a) => membersById[a.entityId]?.type === "agent"
  );

  // Online humans (excluding self)
  const onlineHumans = onlineUsers.filter(
    (u) => membersById[u.entityId]?.type === "human" && u.entityId !== currentEntityId
  );

  // Build status indicators
  const indicators: { label: string; pulse: boolean }[] = [];

  for (const agent of runningAgents) {
    const name = agent.entityName || membersById[agent.entityId]?.displayName || "AI Agent";
    indicators.push({ label: `${name} is thinking…`, pulse: true });
  }
  for (const user of onlineHumans) {
    const name = membersById[user.entityId]?.displayName || "User";
    indicators.push({ label: `${name} is online`, pulse: false });
  }

  return (
    <div className="flex flex-1 flex-col justify-center min-w-0">
      <span className="text-sm font-medium text-foreground truncate">
        {spaceName || "AI Assistant"}
      </span>
      {indicators.length > 0 && (
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {indicators.map((ind, i) => (
            <div key={i} className="flex items-center gap-1">
              <span
                className={`size-1.5 rounded-full bg-emerald-500 ${ind.pulse ? "animate-pulse" : ""}`}
              />
              <span className="text-[11px] text-muted-foreground/80">{ind.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ChatPageProps {
  session: AuthSession;
  onLogout: () => void;
}

export function ChatPage({ session, onLogout }: ChatPageProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem("hsafa-sidebar-collapsed") === "true";
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("hsafa-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  // Read initial space from URL, fall back to session default
  const initialSpaceId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("space") || session.user.smartSpaceId;
  }, [session.user.smartSpaceId]);

  // Keep URL in sync with selected space
  const handleSpaceChange = useCallback((spaceId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("space", spaceId);
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <HsafaChatProvider
      gatewayUrl={GATEWAY_URL}
      publicKey={PUBLIC_KEY}
      jwt={session.token}
      entityId={session.user.entityId}
      defaultSpaceId={initialSpaceId}
      onSpaceChange={handleSpaceChange}
    >
      <div className="flex h-dvh w-full bg-background">
        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden md:flex h-full flex-col border-r border-border bg-muted/30 transition-all duration-200",
            sidebarCollapsed
              ? "md:w-0 overflow-hidden opacity-0"
              : "md:w-[260px] opacity-100"
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between px-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageSquareIcon className="size-4 text-primary" />
              <span className="text-foreground/90">Hsafa</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <ThreadList />
          </div>
          <div className="border-t border-border p-3">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <div className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                {session.user.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 truncate text-xs text-muted-foreground">
                {session.user.name}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={onLogout}
                className="size-7"
                title="Logout"
              >
                <LogOutIcon className="size-3" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="hidden md:flex size-9"
            >
              {sidebarCollapsed ? (
                <MenuIcon className="size-4" />
              ) : (
                <PanelLeftIcon className="size-4" />
              )}
            </Button>

            <SpaceHeader />

            <ThemeToggle />

            {/* Mobile logout */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="md:hidden size-9"
              title="Logout"
            >
              <LogOutIcon className="size-4" />
            </Button>
          </header>

          {/* Chat Area */}
          <main className="flex-1 overflow-hidden">
            <Thread />
          </main>
        </div>
      </div>
    </HsafaChatProvider>
  );
}
