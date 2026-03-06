"use client";

import { useState, type FC } from "react";

// =============================================================================
// HsafaImageTool — Rich UI for the generateImage tool call
//
// Shows a shimmer skeleton while generating, then displays the image with
// a prompt caption, download link, and duration badge.
//
// Usage in assistant-ui MessagePrimitive.Parts:
//   tools: { by_name: { generateImage: ImageToolUI } }
// =============================================================================

export interface ImageToolProps {
  toolName?: string;
  argsText?: string;
  args?: { prompt?: string; [key: string]: unknown };
  result?: {
    success?: boolean;
    images?: Array<{ url: string; mediaType?: string }>;
    duration?: number;
    provider?: string;
    model?: string;
    [key: string]: unknown;
  };
  status?: { type: string; reason?: string };
  toolCallId?: string;
}

function parseResult(result: unknown): ImageToolProps["result"] | undefined {
  if (!result) return undefined;
  if (typeof result === "object") return result as ImageToolProps["result"];
  if (typeof result === "string") {
    try {
      return JSON.parse(result);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const ImageToolUI: FC<ImageToolProps> = (props) => {
  const { args, argsText, result: rawResult, status } = props;

  const isRunning = status?.type === "running";
  const isError = status?.type === "incomplete" && status?.reason === "error";
  const prompt =
    args?.prompt ?? tryParsePrompt(argsText) ?? "Generating image…";
  const parsed = parseResult(rawResult);
  const images = parsed?.images ?? [];
  const duration = parsed?.duration;
  const hasImage = images.length > 0 && !!images[0].url;

  return (
    <div className="hsafa-img-tool">
      {/* Prompt caption */}
      <div className="hsafa-img-tool__prompt">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, opacity: 0.5 }}
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <span>{prompt}</span>
      </div>

      {/* Image area */}
      <div className="hsafa-img-tool__frame">
        {isRunning && <ImageSkeleton />}

        {isError && (
          <div className="hsafa-img-tool__error">
            <span>✕</span>
            <span>Failed to generate image</span>
          </div>
        )}

        {!isRunning && !isError && hasImage && (
          <ImageDisplay url={images[0].url} prompt={prompt} />
        )}

        {!isRunning && !isError && !hasImage && parsed && (
          <div className="hsafa-img-tool__error">
            <span>No image returned</span>
          </div>
        )}
      </div>

      {/* Footer: duration + download */}
      {!isRunning && hasImage && (
        <div className="hsafa-img-tool__footer">
          {duration && (
            <span className="hsafa-img-tool__badge">
              {(duration / 1000).toFixed(1)}s
            </span>
          )}
          <a
            href={images[0].url}
            target="_blank"
            rel="noopener noreferrer"
            className="hsafa-img-tool__link"
          >
            Open full size ↗
          </a>
        </div>
      )}

      <style>{IMAGE_TOOL_STYLES}</style>
    </div>
  );
};

function ImageSkeleton() {
  return (
    <div className="hsafa-img-tool__skeleton">
      <div className="hsafa-img-tool__skeleton-icon">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </div>
      <span className="hsafa-img-tool__skeleton-text">
        Creating your image…
      </span>
      <div className="hsafa-img-tool__skeleton-bar" />
    </div>
  );
}

function ImageDisplay({ url, prompt }: { url: string; prompt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="hsafa-img-tool__img-wrap">
      {!loaded && (
        <div className="hsafa-img-tool__img-loading">
          <div className="hsafa-img-tool__skeleton-bar" />
        </div>
      )}
      <img
        src={url}
        alt={prompt}
        className="hsafa-img-tool__img"
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function tryParsePrompt(argsText?: string): string | undefined {
  if (!argsText) return undefined;
  try {
    const parsed = JSON.parse(argsText);
    return parsed?.prompt;
  } catch {
    return undefined;
  }
}

const IMAGE_TOOL_STYLES = `
  .hsafa-img-tool {
    --_border: var(--hsafa-img-border, var(--border, hsl(0 0% 89.8%)));
    --_bg: var(--hsafa-img-bg, var(--card, hsl(0 0% 100%)));
    --_fg: var(--hsafa-img-fg, var(--muted-foreground, hsl(0 0% 45%)));
    --_accent: var(--hsafa-img-accent, var(--primary, hsl(222 47% 51%)));
    --_shimmer: var(--hsafa-img-shimmer, color-mix(in oklch, var(--primary, hsl(226 83% 82%)) 30%, transparent));
    --_skeleton-bg: var(--hsafa-img-skeleton-bg, var(--muted, hsl(0 0% 96%)));

    border-radius: 0.75rem;
    border: 1px solid var(--_border);
    overflow: hidden;
    background: var(--_bg);
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
    max-width: 420px;
  }

  .hsafa-img-tool__prompt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    font-size: 0.8rem;
    color: var(--_fg);
    border-bottom: 1px solid var(--_border);
    line-height: 1.4;
  }
  .hsafa-img-tool__prompt span {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .hsafa-img-tool__frame {
    position: relative;
    min-height: 80px;
  }

  /* Skeleton */
  .hsafa-img-tool__skeleton {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2.5rem 1rem;
    background: var(--_skeleton-bg);
  }
  .hsafa-img-tool__skeleton-icon {
    color: var(--_fg);
    opacity: 0.35;
    animation: hsafa-img-pulse 2s ease-in-out infinite;
  }
  .hsafa-img-tool__skeleton-text {
    font-size: 0.75rem;
    color: var(--_fg);
    opacity: 0.7;
  }
  .hsafa-img-tool__skeleton-bar {
    width: 60%;
    height: 3px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent 0%, var(--_shimmer) 50%, transparent 100%);
    background-size: 200% 100%;
    animation: hsafa-img-shimmer 1.5s ease-in-out infinite;
  }

  /* Error */
  .hsafa-img-tool__error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem 1rem;
    font-size: 0.8rem;
    color: var(--destructive, hsl(0 72% 51%));
    opacity: 0.8;
  }

  /* Image */
  .hsafa-img-tool__img-wrap {
    position: relative;
    line-height: 0;
  }
  .hsafa-img-tool__img-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    background: var(--_skeleton-bg);
  }
  .hsafa-img-tool__img {
    display: block;
    width: 100%;
    height: auto;
    transition: opacity 0.3s ease;
  }

  /* Footer */
  .hsafa-img-tool__footer {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-top: 1px solid var(--_border);
    font-size: 0.7rem;
  }
  .hsafa-img-tool__badge {
    background: var(--_skeleton-bg);
    color: var(--_fg);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-variant-numeric: tabular-nums;
  }
  .hsafa-img-tool__link {
    margin-left: auto;
    color: var(--_accent);
    text-decoration: none;
    font-weight: 500;
  }
  .hsafa-img-tool__link:hover {
    text-decoration: underline;
  }

  @keyframes hsafa-img-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 0.15; }
  }
  @keyframes hsafa-img-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;
