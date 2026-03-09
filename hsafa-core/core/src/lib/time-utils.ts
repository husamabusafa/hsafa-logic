// =============================================================================
// Time Utilities
//
// Shared helpers for human-readable time formatting throughout the agent system.
// =============================================================================

/**
 * Format a relative time string from an ISO timestamp or Date.
 * e.g., "just now", "5 minutes ago", "3 hours ago", "2 weeks ago"
 */
export function relativeTime(ts: string | Date, now?: Date): string {
  const then = typeof ts === 'string' ? new Date(ts) : ts;
  const ref = now ?? new Date();
  const diffMs = ref.getTime() - then.getTime();

  if (diffMs < 0) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} weeks ago`;

  const months = Math.floor(days / 30);
  return `${months} months ago`;
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
