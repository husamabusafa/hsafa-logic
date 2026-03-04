// =============================================================================
// Time Utilities
//
// Shared helpers for human-readable time formatting throughout the agent system.
// =============================================================================

/**
 * Format a relative time string from an ISO timestamp or Date.
 * e.g., "2m ago", "3h ago", "just now"
 */
export function relativeTime(ts: string | Date, now?: Date): string {
  const then = typeof ts === 'string' ? new Date(ts) : ts;
  const ref = now ?? new Date();
  const diffMs = ref.getTime() - then.getTime();

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Format milliseconds as a human-readable duration.
 * e.g., "1.2s", "450ms", "2m 30s"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}
