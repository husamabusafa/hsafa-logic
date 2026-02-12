"use client";

import { useState, type FC } from "react";
import { useMessage } from "@assistant-ui/react";
import { useToolResult } from "@hsafa/ui";

export interface ProductCardProps {
  toolName?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  status?: { type: string; reason?: string };
  toolCallId?: string;
}

interface ProductData {
  name: string;
  price: number;
  description: string;
  imageUrl?: string;
  rating?: number;
  inStock?: boolean;
}

function parseProduct(props: ProductCardProps): ProductData | null {
  const raw = props.args;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!data.name || data.price == null) return null;
  return {
    name: String(data.name),
    price: Number(data.price),
    description: String(data.description ?? ""),
    imageUrl: data.imageUrl ? String(data.imageUrl) : undefined,
    rating: data.rating != null ? Number(data.rating) : undefined,
    inStock: data.inStock != null ? Boolean(data.inStock) : undefined,
  };
}

function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);

  return (
    <span className="flex items-center gap-0.5 text-amber-400">
      {"★".repeat(full)}
      {half && "½"}
      <span className="text-muted-foreground/30">{"★".repeat(empty)}</span>
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  );
}

export const ProductCard: FC<ProductCardProps> = (props) => {
  const { status, toolCallId } = props;
  const isRunning = status?.type === "running";
  const product = parseProduct(props);
  const messageId = useMessage((m) => m.id);
  const { submitToRun, isSubmitting } = useToolResult();
  const [submitted, setSubmitted] = useState(false);

  const isPending = isRunning && product != null;
  const hasResult = props.result != null || submitted;

  const handleClick = async () => {
    if (!isPending || !toolCallId || submitted || isSubmitting) return;
    setSubmitted(true);
    try {
      await submitToRun(messageId, {
        callId: toolCallId,
        result: {
          action: "selected",
          productName: product!.name,
          price: product!.price,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      setSubmitted(false);
    }
  };

  if (isRunning && !product) {
    return (
      <div className="my-2 w-72 animate-pulse rounded-xl border border-border bg-muted/40 p-4">
        <div className="mb-3 h-36 rounded-lg bg-muted" />
        <div className="mb-2 h-4 w-3/4 rounded bg-muted" />
        <div className="mb-2 h-3 w-full rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="my-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Product data unavailable
      </div>
    );
  }

  return (
    <div
      onClick={isPending && !submitted ? handleClick : undefined}
      className={`my-2 w-72 overflow-hidden rounded-xl border bg-card shadow-sm transition-all ${
        isPending && !submitted
          ? "border-primary/50 cursor-pointer hover:shadow-md hover:border-primary hover:scale-[1.02] active:scale-[0.98]"
          : hasResult
            ? "border-emerald-500/50"
            : "border-border"
      }`}
    >
      {product.imageUrl && (
        <div className="relative h-40 w-full overflow-hidden bg-muted">
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight">{product.name}</h3>
          <span className="shrink-0 text-sm font-bold text-primary">
            ${product.price.toFixed(2)}
          </span>
        </div>

        {product.description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}

        <div className="mt-2 flex items-center justify-between">
          {product.rating != null && <Stars rating={product.rating} />}
          {product.inStock != null && (
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                product.inStock
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-500 dark:text-red-400"
              }`}
            >
              {product.inStock ? "In Stock" : "Out of Stock"}
            </span>
          )}
        </div>

        {isPending && !submitted && (
          <p className="mt-2 text-center text-xs font-medium text-primary animate-pulse">
            Click to select this product
          </p>
        )}
        {submitted && (
          <p className="mt-2 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
            ✓ Selected
          </p>
        )}
      </div>
    </div>
  );
};
