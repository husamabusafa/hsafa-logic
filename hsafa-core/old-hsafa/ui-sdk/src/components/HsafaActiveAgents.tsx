"use client";

import type { FC } from "react";
import { useActiveAgents } from "../contexts";
import { useMembers } from "../contexts";

export interface ActiveAgentsBarProps {
  /** Custom class name for the container */
  className?: string;
}

/**
 * ActiveAgentsBar — Shows which AI agents are currently active.
 *
 * Displays a subtle bar above the chat:
 * - 1 agent:  "🟢 AI Assistant is active"
 * - 2+ agents: "🟢 2 agents are active"
 * - 0 agents:  hidden
 *
 * Only shows agents that are members of the current space.
 * Uses useActiveAgents() context from HsafaChatProvider.
 */
export const ActiveAgentsBar: FC<ActiveAgentsBarProps> = ({ className }) => {
  const activeAgents = useActiveAgents();
  const { membersById } = useMembers();

  // Filter to agents that are members of the current space
  const visibleAgents = activeAgents.filter(
    (a) => membersById[a.entityId] && membersById[a.entityId].type === "agent"
  );

  if (visibleAgents.length === 0) return null;

  const label =
    visibleAgents.length === 1
      ? `${visibleAgents[0].entityName || membersById[visibleAgents[0].entityId]?.displayName || "AI Agent"} is active`
      : `${visibleAgents.length} agents are active`;

  return (
    <div className={className} style={styles.container}>
      <span style={styles.dot} />
      <span style={styles.label}>{label}</span>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 12px",
    fontSize: "12px",
    color: "var(--hsafa-active-text, #6b7280)",
    borderBottom: "1px solid var(--hsafa-active-border, rgba(0,0,0,0.06))",
    background: "var(--hsafa-active-bg, rgba(0,0,0,0.02))",
    transition: "opacity 0.2s ease",
  },
  dot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: "var(--hsafa-active-dot, #22c55e)",
    flexShrink: 0,
    animation: "hsafa-pulse 2s ease-in-out infinite",
  },
  label: {
    fontWeight: 500,
    letterSpacing: "0.01em",
  },
};
