import { useRef, useCallback, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import { Loader2Icon } from "lucide-react";

// ═════════════════════════════════════════════════════════════════════════════
// CodeTerminal — a shared terminal-style code viewer / editor.
//
// Modes:
//   • editable  — transparent textarea overlaid on syntax-highlighted pre
//   • read-only — scrollable highlighted content (logs, previews, etc.)
//
// Highlighting is controlled via the `highlight` prop:
//   • "env"  — .env syntax (comments, KEY=value, [secret], (required))
//   • "log"  — log-level coloring (error → red, warn → yellow, info → green)
//   • "none" — plain monospace text
//   • (fn)   — custom per-line highlight function
// ═════════════════════════════════════════════════════════════════════════════

// ── Built-in highlighters ────────────────────────────────────────────────────

export type HighlightFn = (line: string) => React.ReactNode;

function highlightEnvLine(line: string): React.ReactNode {
  if (!line) return "\n";

  // Comment
  if (line.trimStart().startsWith("#")) {
    const parts: React.ReactNode[] = [];
    const tagRegex = /(\[secret\]|\(required\))/gi;
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    let idx = 0;
    while ((match = tagRegex.exec(line)) !== null) {
      if (match.index > lastEnd) {
        parts.push(<span key={`c-${idx++}`} className="text-zinc-500">{line.slice(lastEnd, match.index)}</span>);
      }
      const tag = match[1];
      parts.push(
        <span key={`t-${idx++}`} className={tag.toLowerCase() === "[secret]" ? "text-amber-500/80" : "text-blue-400/80"}>
          {tag}
        </span>,
      );
      lastEnd = match.index + tag.length;
    }
    if (lastEnd < line.length) {
      parts.push(<span key={`c-${idx++}`} className="text-zinc-500">{line.slice(lastEnd)}</span>);
    }
    return parts.length > 0 ? parts : <span className="text-zinc-500">{line}</span>;
  }

  // KEY=VALUE
  const eqIdx = line.indexOf("=");
  if (eqIdx > 0) {
    return (
      <>
        <span className="text-cyan-400">{line.slice(0, eqIdx)}</span>
        <span className="text-zinc-500">=</span>
        <span className="text-amber-300">{line.slice(eqIdx + 1)}</span>
      </>
    );
  }

  return <span className="text-zinc-400">{line}</span>;
}

function highlightLogLine(line: string): React.ReactNode {
  if (!line) return "\n";
  const lower = line.toLowerCase();
  const cls = cn(
    "text-zinc-400",
    lower.includes("error") && "text-red-400",
    lower.includes("warn") && "text-yellow-400",
    (lower.includes("info") || lower.includes("connected") || lower.includes("ready")) && "text-green-400",
    line.startsWith(">") && "text-cyan-400",
  );
  return <span className={cls}>{line}</span>;
}

function highlightNone(line: string): React.ReactNode {
  return <span className="text-zinc-400">{line || "\n"}</span>;
}

function resolveHighlighter(h: CodeTerminalProps["highlight"]): HighlightFn {
  if (typeof h === "function") return h;
  if (h === "env") return highlightEnvLine;
  if (h === "log") return highlightLogLine;
  return highlightNone;
}

// ── Public ref handle ────────────────────────────────────────────────────────

export interface CodeTerminalHandle {
  scrollToBottom: () => void;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CodeTerminalProps {
  value: string;
  onChange?: (value: string) => void;
  highlight?: "env" | "log" | "none" | HighlightFn;
  title?: string;
  titleRight?: React.ReactNode;
  loading?: boolean;
  maxRows?: number;
  minRows?: number;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export const CodeTerminal = forwardRef<CodeTerminalHandle, CodeTerminalProps>(
  function CodeTerminal(
    {
      value,
      onChange,
      highlight = "none",
      title = "terminal",
      titleRight,
      loading = false,
      maxRows = 24,
      minRows = 8,
      className,
    },
    ref,
  ) {
    const editable = typeof onChange === "function";
    const highlightLine = resolveHighlighter(highlight);
    const lines = value.split("\n");
    const visibleRows = Math.min(maxRows, Math.max(minRows, lines.length + 1));

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLPreElement>(null);
    const lineNumbersRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const [focused, setFocused] = useState(false);

    // Expose scrollToBottom to parent
    useImperativeHandle(ref, () => ({
      scrollToBottom: () => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
    }));

    // Sync scroll (editable mode — textarea drives highlight + line numbers)
    const syncScroll = useCallback(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (highlightRef.current) {
        highlightRef.current.scrollTop = ta.scrollTop;
        highlightRef.current.scrollLeft = ta.scrollLeft;
      }
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = ta.scrollTop;
      }
    }, []);

    useEffect(() => {
      if (!editable) return;
      const ta = textareaRef.current;
      if (!ta) return;
      ta.addEventListener("scroll", syncScroll);
      return () => ta.removeEventListener("scroll", syncScroll);
    }, [editable, syncScroll]);

    // Tab key
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Tab" && onChange) {
          e.preventDefault();
          const ta = e.currentTarget;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          onChange(value.slice(0, start) + "  " + value.slice(end));
          requestAnimationFrame(() => {
            ta.selectionStart = ta.selectionEnd = start + 2;
          });
        }
      },
      [value, onChange],
    );

    return (
      <div
        className={cn(
          "rounded-lg overflow-hidden border transition-colors flex flex-col",
          focused ? "border-primary/50 ring-2 ring-primary/20" : "border-zinc-800",
          className,
        )}
      >
        {/* ── Title bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-zinc-800">
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-3 rounded-full bg-[#febc2e]" />
            <div className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[10px] text-zinc-500 font-mono ml-2">{title}</span>
          {titleRight && <div className="ml-auto flex items-center">{titleRight}</div>}
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center bg-[#0d1117] py-16">
            <Loader2Icon className="size-5 animate-spin text-zinc-600" />
          </div>
        ) : editable ? (
          /* ── Editable mode ─────────────────────────────────────── */
          <div className="relative bg-[#0d1117] flex">
            {/* Line numbers */}
            <div
              ref={lineNumbersRef}
              className="select-none overflow-hidden shrink-0 py-3 bg-[#0d1117] border-r border-zinc-800/50"
              aria-hidden="true"
            >
              {lines.map((_, i) => (
                <div key={i} className="px-3 text-right text-[13px] leading-[1.7] font-mono text-zinc-600">{i + 1}</div>
              ))}
            </div>

            <div className="relative flex-1 min-w-0">
              {/* Syntax-highlighted underlay */}
              <pre
                ref={highlightRef}
                className="absolute inset-0 p-3 overflow-hidden pointer-events-none font-mono text-[13px] leading-[1.7] whitespace-pre m-0"
                aria-hidden="true"
              >
                {lines.map((line, i) => (
                  <div key={i}>{highlightLine(line)}</div>
                ))}
              </pre>

              {/* Transparent textarea */}
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange!(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={handleKeyDown}
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
                rows={visibleRows}
                className="relative w-full p-3 bg-transparent font-mono text-[13px] leading-[1.7] resize-none outline-none text-transparent caret-zinc-300 selection:bg-blue-500/30"
                style={{ minHeight: `${visibleRows * 1.7}em` }}
                placeholder="KEY=value"
              />
            </div>
          </div>
        ) : (
          /* ── Read-only mode ────────────────────────────────────── */
          <div
            ref={contentRef}
            className="overflow-auto bg-[#0d1117] min-h-[300px] flex-1"
          >
            <div className="flex min-w-0">
              {/* Line numbers — inside the scroll container so they scroll with content */}
              <div className="select-none shrink-0 py-3 sticky left-0 bg-[#0d1117] border-r border-zinc-800/50 z-[1]" aria-hidden="true">
                {lines.map((_, i) => (
                  <div key={i} className="px-3 text-right text-[13px] leading-[1.7] font-mono text-zinc-600">{i + 1}</div>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 py-3 px-3 font-mono text-[13px] leading-[1.7] selection:bg-blue-500/30">
                {lines.map((line, i) => (
                  <div key={i} className="hover:bg-white/[0.03] rounded whitespace-pre">
                    {highlightLine(line)}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
