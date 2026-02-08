"use client";

import { useState, useEffect, type FC } from "react";

// =============================================================================
// HsafaReasoning — Collapsible "Thinking…" block for AI reasoning
//
// Used as the `Reasoning` component for @assistant-ui/react MessagePrimitive.Parts.
// Props: { type: 'reasoning', text: string, status: { type: string } }
//
// Uses CSS grid-template-rows for smooth animated expand/collapse that
// works perfectly with dynamic content height (e.g. streaming text).
// =============================================================================

export interface ReasoningPartProps {
  type: "reasoning";
  text: string;
  status: { type: string };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export const ReasoningPart: FC<ReasoningPartProps> = ({ text, status }) => {
  const isStreaming = status?.type === "running";
  const [open, setOpen] = useState(false);

  // Auto-open when streaming starts
  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  // Auto-close when streaming finishes
  useEffect(() => {
    if (!isStreaming && status?.type === "complete") setOpen(false);
  }, [isStreaming, status?.type]);

  if (!text) return null;

  const tokens = estimateTokens(text);

  return (
    <div
      style={{
        borderRadius: "0.5rem",
        border: "1px solid var(--hsafa-reasoning-border, #e5e7eb)",
        marginBottom: "0.5rem",
        overflow: "hidden",
        background: "var(--hsafa-reasoning-bg, #f9fafb)",
      }}
    >
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        type="button"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "0.8rem",
          color: "var(--hsafa-reasoning-fg, #6b7280)",
          fontFamily: "inherit",
        }}
      >
        {isStreaming ? (
          <span
            style={{
              display: "inline-block",
              width: "0.75rem",
              height: "0.75rem",
              border: "1.5px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "hsafa-reasoning-spin 0.6s linear infinite",
            }}
          />
        ) : (
          <span
            style={{
              transform: open ? "rotate(90deg)" : "rotate(0deg)",
              transition: "transform 0.15s ease",
              display: "inline-block",
              fontSize: "0.65rem",
            }}
          >
            ▶
          </span>
        )}
        <span style={{ fontWeight: 500 }}>
          {isStreaming ? "Thinking…" : "Thought process"}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.625rem",
            opacity: 0.6,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tokens} tokens
        </span>
      </button>

      {/* Animated content via grid-template-rows */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "0 0.75rem 0.5rem",
              fontSize: "0.8rem",
              color: "var(--hsafa-reasoning-fg, #6b7280)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}
          >
            {text}
          </div>
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes hsafa-reasoning-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
