"use client";

import { useState, type FC } from "react";
import { useMessage } from "@assistant-ui/react";
import { useToolResult } from "@hsafa/react";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";

export interface ConfirmationUIProps {
  toolName?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  status?: { type: string; reason?: string };
  toolCallId?: string;
}

interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel: string;
  rejectLabel: string;
}

function parseConfirmation(props: ConfirmationUIProps): ConfirmationData | null {
  let raw = props.args;
  // Fallback: try parsing argsText if args is null/undefined
  if (!raw && props.argsText) {
    try { raw = JSON.parse(props.argsText); } catch { /* ignore */ }
  }
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!data.title || !data.message) return null;
  return {
    title: String(data.title),
    message: String(data.message),
    confirmLabel: data.confirmLabel ? String(data.confirmLabel) : "Confirm",
    rejectLabel: data.rejectLabel ? String(data.rejectLabel) : "Cancel",
  };
}

export const ConfirmationUI: FC<ConfirmationUIProps> = (props) => {
  const { status, toolCallId } = props;
  const isRunning = status?.type === "running";
  const confirmation = parseConfirmation(props);
  const runId = useMessage((m) => (m.metadata as any)?.custom?.runId as string | undefined);
  const { submitToRun, isSubmitting } = useToolResult();
  const [choice, setChoice] = useState<"confirmed" | "rejected" | null>(null);

  // Parse result from persisted message (after page refresh)
  const persistedResult = props.result as
    | { confirmed?: boolean; action?: string }
    | null
    | undefined;
  const wasConfirmed =
    choice === "confirmed" || persistedResult?.confirmed === true;
  const wasRejected =
    choice === "rejected" || persistedResult?.confirmed === false;
  const isResolved = wasConfirmed || wasRejected || choice != null || status?.type === "complete";

  const isPending = isRunning && confirmation != null && choice === null;

  const handleConfirm = async () => {
    if (!isPending || !toolCallId || !runId || isSubmitting) return;
    setChoice("confirmed");
    try {
      await submitToRun(runId, {
        callId: toolCallId,
        result: { confirmed: true, action: "confirmed" },
      });
    } catch {
      setChoice(null);
    }
  };

  const handleReject = async () => {
    if (!isPending || !toolCallId || !runId || isSubmitting) return;
    setChoice("rejected");
    try {
      await submitToRun(runId, {
        callId: toolCallId,
        result: { confirmed: false, action: "rejected" },
      });
    } catch {
      setChoice(null);
    }
  };

  // Loading skeleton — only while still streaming / running with no args yet
  if (isRunning && !confirmation && !isResolved) {
    return (
      <div className="my-2 w-80 animate-pulse rounded-xl border border-border bg-muted/40 p-4">
        <div className="mb-3 h-5 w-2/3 rounded bg-muted" />
        <div className="mb-2 h-3 w-full rounded bg-muted" />
        <div className="mb-4 h-3 w-4/5 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-9 flex-1 rounded-lg bg-muted" />
          <div className="h-9 flex-1 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  // Resolved state — show even if args parsing failed (e.g. after page refresh)
  if (!confirmation && isResolved) {
    return (
      <div
        className={`my-2 w-80 overflow-hidden rounded-xl border shadow-sm ${
          wasConfirmed
            ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20"
            : "border-red-500/30 bg-red-50/30 dark:bg-red-950/10"
        }`}
      >
        <div className="px-4 py-3">
          {wasConfirmed ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Confirmed
            </div>
          ) : wasRejected ? (
            <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
              <XCircle className="size-3.5" />
              Cancelled
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CheckCircle2 className="size-3.5" />
              Completed
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!confirmation) {
    return (
      <div className="my-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Confirmation data unavailable
      </div>
    );
  }

  return (
    <div
      className={`my-2 w-80 overflow-hidden rounded-xl border shadow-sm transition-all ${
        isPending
          ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20"
          : wasConfirmed
            ? "border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20"
            : wasRejected
              ? "border-red-500/30 bg-red-50/30 dark:bg-red-950/10"
              : "border-border bg-card"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${
            isPending
              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
              : wasConfirmed
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                : wasRejected
                  ? "bg-red-100 text-red-500 dark:bg-red-900/40 dark:text-red-400"
                  : "bg-muted text-muted-foreground"
          }`}
        >
          {isPending && <AlertTriangle className="size-4" />}
          {wasConfirmed && <CheckCircle2 className="size-4" />}
          {wasRejected && <XCircle className="size-4" />}
          {!isPending && !isResolved && <AlertTriangle className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight">
            {confirmation.title}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {confirmation.message}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-2">
        {isPending && (
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={isSubmitting}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {confirmation.rejectLabel}
            </button>
            <button
              onClick={handleConfirm}
              disabled={isSubmitting}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {isSubmitting ? (
                <Loader2 className="mx-auto size-3.5 animate-spin" />
              ) : (
                confirmation.confirmLabel
              )}
            </button>
          </div>
        )}

        {wasConfirmed && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Confirmed
          </div>
        )}

        {wasRejected && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-red-500 dark:text-red-400">
            <XCircle className="size-3.5" />
            Cancelled
          </div>
        )}
      </div>
    </div>
  );
};
