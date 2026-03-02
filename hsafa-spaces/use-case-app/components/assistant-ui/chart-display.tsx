"use client";

import { type FC } from "react";
import { BarChart3, PieChart, TrendingUp, Loader2 } from "lucide-react";

export interface ChartDisplayProps {
  toolName?: string;
  argsText?: string;
  args?: unknown;
  result?: unknown;
  status?: { type: string; reason?: string };
  toolCallId?: string;
}

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface ChartData {
  type: "bar" | "line" | "pie";
  title: string;
  data: DataPoint[];
  xLabel?: string;
  yLabel?: string;
}

const DEFAULT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
];

function parseChart(props: ChartDisplayProps): ChartData | null {
  const raw = props.args;
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!data.type || !data.title || !Array.isArray(data.data)) return null;
  const points = (data.data as Array<Record<string, unknown>>)
    .filter((d) => d.label != null && d.value != null)
    .map((d, i) => ({
      label: String(d.label),
      value: Number(d.value),
      color: d.color ? String(d.color) : DEFAULT_COLORS[i % DEFAULT_COLORS.length],
    }));
  if (points.length === 0) return null;
  return {
    type: data.type as ChartData["type"],
    title: String(data.title),
    data: points,
    xLabel: data.xLabel ? String(data.xLabel) : undefined,
    yLabel: data.yLabel ? String(data.yLabel) : undefined,
  };
}

function ChartIcon({ type }: { type: string }) {
  switch (type) {
    case "pie":
      return <PieChart className="size-4" />;
    case "line":
      return <TrendingUp className="size-4" />;
    default:
      return <BarChart3 className="size-4" />;
  }
}

// ─── Bar Chart ─────────────────────────────────────────────────────────────

function BarChartView({ chart }: { chart: ChartData }) {
  const maxVal = Math.max(...chart.data.map((d) => d.value), 1);

  return (
    <div className="space-y-1.5">
      {chart.yLabel && (
        <p className="text-[10px] text-muted-foreground mb-2">{chart.yLabel}</p>
      )}
      {chart.data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-16 shrink-0 truncate text-right text-[11px] text-muted-foreground">
            {d.label}
          </span>
          <div className="relative h-6 flex-1 overflow-hidden rounded bg-muted/50">
            <div
              className="absolute inset-y-0 left-0 rounded transition-all duration-700 ease-out"
              style={{
                width: `${(d.value / maxVal) * 100}%`,
                backgroundColor: d.color,
                minWidth: d.value > 0 ? "4px" : "0px",
              }}
            />
            <span className="relative z-10 flex h-full items-center px-2 text-[11px] font-medium">
              {d.value.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
      {chart.xLabel && (
        <p className="text-[10px] text-muted-foreground text-center mt-2">
          {chart.xLabel}
        </p>
      )}
    </div>
  );
}

// ─── Line Chart (SVG) ──────────────────────────────────────────────────────

function LineChartView({ chart }: { chart: ChartData }) {
  const W = 320;
  const H = 160;
  const PAD = { top: 10, right: 15, bottom: 30, left: 45 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const maxVal = Math.max(...chart.data.map((d) => d.value), 1);
  const minVal = Math.min(...chart.data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;

  const points = chart.data.map((d, i) => ({
    x: PAD.left + (chart.data.length > 1 ? (i / (chart.data.length - 1)) * plotW : plotW / 2),
    y: PAD.top + plotH - ((d.value - minVal) / range) * plotH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${PAD.top + plotH} L ${points[0].x} ${PAD.top + plotH} Z`;
  const color = chart.data[0]?.color || DEFAULT_COLORS[0];

  // Y-axis ticks
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => minVal + (range / yTicks) * i);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
        {/* Grid lines */}
        {yTickValues.map((v, i) => {
          const y = PAD.top + plotH - ((v - minVal) / range) * plotH;
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={y}
                x2={W - PAD.right}
                y2={y}
                className="stroke-muted-foreground/15"
                strokeWidth={0.5}
              />
              <text
                x={PAD.left - 5}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground"
                fontSize={8}
              >
                {v % 1 === 0 ? v : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill={color} opacity={0.1} />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} stroke="white" strokeWidth={1.5} />
        ))}

        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={H - PAD.bottom + 15}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={8}
          >
            {p.label.length > 8 ? p.label.slice(0, 7) + "…" : p.label}
          </text>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground px-1 -mt-1">
        {chart.yLabel && <span>{chart.yLabel}</span>}
        {chart.xLabel && <span className="ml-auto">{chart.xLabel}</span>}
      </div>
    </div>
  );
}

// ─── Pie Chart (SVG) ───────────────────────────────────────────────────────

function PieChartView({ chart }: { chart: ChartData }) {
  const total = chart.data.reduce((s, d) => s + Math.abs(d.value), 0) || 1;
  const CX = 80;
  const CY = 80;
  const R = 65;

  let cumAngle = -Math.PI / 2;
  const slices = chart.data.map((d) => {
    const angle = (Math.abs(d.value) / total) * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    return {
      ...d,
      path: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      percentage: ((Math.abs(d.value) / total) * 100).toFixed(1),
    };
  });

  return (
    <div className="flex items-start gap-4">
      <svg viewBox="0 0 160 160" className="size-32 shrink-0">
        {slices.map((s, i) => (
          <path
            key={i}
            d={s.path}
            fill={s.color}
            stroke="white"
            strokeWidth={1.5}
            className="transition-opacity hover:opacity-80"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-1 pt-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
              {s.label}
            </span>
            <span className="text-[10px] font-medium ml-auto tabular-nums">
              {s.percentage}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export const ChartDisplay: FC<ChartDisplayProps> = (props) => {
  const chart = parseChart(props);

  // Loading skeleton — args still streaming in (no valid chart yet, no result yet)
  if (!chart && !props.result) {
    return (
      <div className="my-2 w-96 animate-pulse rounded-xl border border-border bg-muted/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="size-4 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
        <div className="h-40 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="my-2 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        Chart data unavailable
      </div>
    );
  }

  return (
    <div className="my-2 w-96 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/30 px-4 py-2.5">
        <span className="text-muted-foreground">
          <ChartIcon type={chart.type} />
        </span>
        <h3 className="text-sm font-semibold leading-tight">{chart.title}</h3>
      </div>

      {/* Chart body */}
      <div className="p-4">
        {chart.type === "bar" && <BarChartView chart={chart} />}
        {chart.type === "line" && <LineChartView chart={chart} />}
        {chart.type === "pie" && <PieChartView chart={chart} />}
      </div>

      {/* Footer */}
      <div className="border-t border-border/50 bg-muted/20 px-4 py-1.5">
        <p className="text-[10px] text-muted-foreground/70">
          {chart.data.length} data point{chart.data.length !== 1 ? "s" : ""} · {chart.type} chart
        </p>
      </div>
    </div>
  );
};
