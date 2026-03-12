import { type MockMessage } from "@/lib/mock-data";
import { BarChart3Icon } from "lucide-react";

interface ChartMessageProps {
  message: MockMessage;
}

export function ChartMessage({ message }: ChartMessageProps) {
  const data = message.chartData || [];
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartType = message.chartType || "bar";

  if (chartType === "pie") {
    return <PieChart message={message} data={data} />;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <BarChart3Icon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.chartTitle}</span>
      </div>

      {chartType === "bar" && (
        <div className="space-y-1.5">
          {data.map((item, i) => {
            const pct = (item.value / maxValue) * 100;
            return (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] opacity-70">{item.label}</span>
                  <span className="text-[11px] font-medium tabular-nums">{item.value}</span>
                </div>
                <div className="h-4 bg-current/10 rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md bg-primary/70 transition-all"
                    style={{ width: `${pct}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chartType === "line" && (
        <div className="h-24 flex items-end gap-1">
          {data.map((item, i) => {
            const pct = (item.value / maxValue) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex justify-center">
                  <div
                    className="w-1.5 rounded-t-full bg-primary/70"
                    style={{ height: `${Math.max(4, pct)}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="text-[8px] opacity-60 truncate max-w-full">{item.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PieChart({ message, data }: { message: MockMessage; data: { label: string; value: number; color?: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const defaultColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];

  let currentAngle = 0;
  const segments = data.map((item, i) => {
    const pct = item.value / total;
    const startAngle = currentAngle;
    const endAngle = currentAngle + pct * 360;
    currentAngle = endAngle;
    return { ...item, pct, startAngle, endAngle, color: item.color || defaultColors[i % defaultColors.length] };
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <BarChart3Icon className="size-4 text-primary shrink-0" />
        <span className="text-sm font-semibold">{message.chartTitle}</span>
      </div>

      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="size-20 shrink-0">
          {segments.map((seg, i) => {
            const startRad = ((seg.startAngle - 90) * Math.PI) / 180;
            const endRad = ((seg.endAngle - 90) * Math.PI) / 180;
            const largeArc = seg.endAngle - seg.startAngle > 180 ? 1 : 0;
            const x1 = 50 + 45 * Math.cos(startRad);
            const y1 = 50 + 45 * Math.sin(startRad);
            const x2 = 50 + 45 * Math.cos(endRad);
            const y2 = 50 + 45 * Math.sin(endRad);
            const d = `M 50 50 L ${x1} ${y1} A 45 45 0 ${largeArc} 1 ${x2} ${y2} Z`;
            return <path key={i} d={d} fill={seg.color} opacity={0.85} />;
          })}
        </svg>

        <div className="space-y-1 min-w-0">
          {segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-[11px] truncate">{seg.label}</span>
              <span className="text-[10px] opacity-60 tabular-nums ml-auto">{Math.round(seg.pct * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
