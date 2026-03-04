"use client";

import { useState, useCallback, useMemo } from "react";
import {
  MenuIcon,
  PanelLeftIcon,
  LogOutIcon,
  MessageSquareIcon,
} from "lucide-react";
import { HsafaChatProvider, useCurrentSpace, useActiveAgents, useMembers } from "@hsafa/ui";

import { Thread } from "@/components/assistant-ui/thread";
import { ThreadList } from "@/components/assistant-ui/thread-list";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { AuthSession } from "@/components/register-form";

const GATEWAY_URL = process.env.NEXT_PUBLIC_HSAFA_GATEWAY_URL || "http://localhost:3001";
const PUBLIC_KEY = process.env.NEXT_PUBLIC_HSAFA_PUBLIC_KEY || "";

function SpaceHeader() {
  const { spaceName } = useCurrentSpace();
  const activeAgents = useActiveAgents();
  const { membersById } = useMembers();

  // Filter to agents in current space
  const visibleAgents = activeAgents.filter(
    (a: { entityId: string; entityName?: string }) => membersById[a.entityId] && membersById[a.entityId].type === "agent"
  );

  const agentLabel =
    visibleAgents.length === 1
      ? `${visibleAgents[0].entityName || membersById[visibleAgents[0].entityId]?.displayName || "AI Agent"} is active`
      : visibleAgents.length > 1
        ? `${visibleAgents.length} agents active`
        : null;

  return (
    <div className="flex flex-1 flex-col justify-center min-w-0">
      <span className="text-sm font-medium text-foreground truncate">
        {spaceName || "AI Assistant"}
      </span>
      {agentLabel && (
        <div className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] text-muted-foreground/80">{agentLabel}</span>
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
    if (typeof window === "undefined") return false;
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
    if (typeof window === "undefined") return session.user.smartSpaceId;
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
