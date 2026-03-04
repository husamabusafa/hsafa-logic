import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { ToolCallContentPart } from '@hsafa/react-native';

interface Props {
  toolCall: ToolCallContentPart;
}

interface DataPoint {
  label: string;
  value: number;
  color: string;
}

interface ChartData {
  type: 'bar' | 'line' | 'pie';
  title: string;
  data: DataPoint[];
  xLabel?: string;
  yLabel?: string;
}

const DEFAULT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
];

function parseChart(args: unknown): ChartData | null {
  if (!args || typeof args !== 'object') return null;
  const data = args as Record<string, unknown>;
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
    type: data.type as ChartData['type'],
    title: String(data.title),
    data: points,
    xLabel: data.xLabel ? String(data.xLabel) : undefined,
    yLabel: data.yLabel ? String(data.yLabel) : undefined,
  };
}

// ─── Bar Chart ─────────────────────────────────────────────────────────────

function BarChartView({ chart }: { chart: ChartData }) {
  const maxVal = Math.max(...chart.data.map((d) => d.value), 1);

  return (
    <View style={cs.barContainer}>
      {chart.yLabel && <Text style={cs.axisLabel}>{chart.yLabel}</Text>}
      {chart.data.map((d, i) => (
        <View key={i} style={cs.barRow}>
          <Text style={cs.barLabel} numberOfLines={1}>{d.label}</Text>
          <View style={cs.barTrack}>
            <View
              style={[
                cs.barFill,
                {
                  width: `${Math.max((d.value / maxVal) * 100, 2)}%`,
                  backgroundColor: d.color,
                },
              ]}
            />
            <Text style={cs.barValue}>{d.value.toLocaleString()}</Text>
          </View>
        </View>
      ))}
      {chart.xLabel && <Text style={[cs.axisLabel, { textAlign: 'center', marginTop: 6 }]}>{chart.xLabel}</Text>}
    </View>
  );
}

// ─── Pie Chart ─────────────────────────────────────────────────────────────

function PieChartView({ chart }: { chart: ChartData }) {
  const total = chart.data.reduce((s, d) => s + Math.abs(d.value), 0) || 1;

  return (
    <View style={cs.pieContainer}>
      {/* Simplified pie — show as proportional stacked bar + legend */}
      <View style={cs.pieBar}>
        {chart.data.map((d, i) => {
          const pct = (Math.abs(d.value) / total) * 100;
          return (
            <View
              key={i}
              style={[cs.pieSegment, { width: `${pct}%`, backgroundColor: d.color }]}
            />
          );
        })}
      </View>
      <View style={cs.pieLegend}>
        {chart.data.map((d, i) => {
          const pct = ((Math.abs(d.value) / total) * 100).toFixed(1);
          return (
            <View key={i} style={cs.legendItem}>
              <View style={[cs.legendDot, { backgroundColor: d.color }]} />
              <Text style={cs.legendLabel} numberOfLines={1}>{d.label}</Text>
              <Text style={cs.legendPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Line Chart (simplified as value dots with connecting concept) ─────────

function LineChartView({ chart }: { chart: ChartData }) {
  const maxVal = Math.max(...chart.data.map((d) => d.value), 1);
  const minVal = Math.min(...chart.data.map((d) => d.value), 0);
  const range = maxVal - minVal || 1;
  const CHART_H = 100;
  const color = chart.data[0]?.color || DEFAULT_COLORS[0];

  return (
    <View style={cs.lineContainer}>
      {chart.yLabel && <Text style={cs.axisLabel}>{chart.yLabel}</Text>}
      <View style={[cs.lineChart, { height: CHART_H }]}>
        {chart.data.map((d, i) => {
          const pct = ((d.value - minVal) / range) * 100;
          const leftPct = chart.data.length > 1
            ? (i / (chart.data.length - 1)) * 100
            : 50;
          return (
            <View
              key={i}
              style={[
                cs.lineDot,
                {
                  left: `${leftPct}%`,
                  bottom: `${pct}%`,
                  backgroundColor: color,
                },
              ]}
            >
              <Text style={cs.lineDotValue}>{d.value}</Text>
            </View>
          );
        })}
      </View>
      <View style={cs.lineLabels}>
        {chart.data.map((d, i) => (
          <Text key={i} style={cs.lineLabel} numberOfLines={1}>
            {d.label.length > 6 ? d.label.slice(0, 5) + '…' : d.label}
          </Text>
        ))}
      </View>
      {chart.xLabel && <Text style={[cs.axisLabel, { textAlign: 'center', marginTop: 4 }]}>{chart.xLabel}</Text>}
    </View>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ChartCard({ toolCall }: Props) {
  const chart = parseChart(toolCall.args);

  // Loading skeleton
  if (!chart && toolCall.status?.type === 'running') {
    return (
      <View style={styles.card}>
        <View style={styles.headerSkeleton}>
          <View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: '#E5E7EB' }} />
          <View style={{ width: 100, height: 14, borderRadius: 4, backgroundColor: '#E5E7EB' }} />
        </View>
        <View style={{ height: 100, borderRadius: 8, backgroundColor: '#E5E7EB' }} />
      </View>
    );
  }

  if (!chart) {
    return (
      <View style={[styles.card, { paddingVertical: 10 }]}>
        <Text style={{ fontSize: 13, color: '#9CA3AF' }}>Chart data unavailable</Text>
      </View>
    );
  }

  const chartIcon = chart.type === 'pie' ? '◐' : chart.type === 'line' ? '📈' : '▊';

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerIcon}>{chartIcon}</Text>
        <Text style={styles.headerTitle} numberOfLines={1}>{chart.title}</Text>
      </View>

      {/* Chart body */}
      <View style={styles.body}>
        {chart.type === 'bar' && <BarChartView chart={chart} />}
        {chart.type === 'line' && <LineChartView chart={chart} />}
        {chart.type === 'pie' && <PieChartView chart={chart} />}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {chart.data.length} data point{chart.data.length !== 1 ? 's' : ''} · {chart.type} chart
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', overflow: 'hidden', marginVertical: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6', backgroundColor: '#F9FAFB' },
  headerIcon: { fontSize: 14, color: '#6B7280' },
  headerTitle: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1 },
  headerSkeleton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  body: { padding: 12 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6', backgroundColor: '#FAFAFA', paddingHorizontal: 12, paddingVertical: 6 },
  footerText: { fontSize: 10, color: '#9CA3AF' },
});

const cs = StyleSheet.create({
  // Bar
  barContainer: { gap: 4 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { width: 56, fontSize: 11, color: '#6B7280', textAlign: 'right' },
  barTrack: { flex: 1, height: 22, borderRadius: 4, backgroundColor: '#F3F4F6', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  barValue: { fontSize: 11, fontWeight: '500', color: '#374151', paddingLeft: 6 },
  axisLabel: { fontSize: 10, color: '#9CA3AF' },
  // Pie
  pieContainer: { gap: 10 },
  pieBar: { flexDirection: 'row', height: 20, borderRadius: 10, overflow: 'hidden' },
  pieSegment: { height: '100%' },
  pieLegend: { gap: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 11, color: '#6B7280' },
  legendPct: { fontSize: 11, fontWeight: '500', color: '#374151' },
  // Line
  lineContainer: { gap: 4 },
  lineChart: { position: 'relative', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', borderLeftWidth: 1, borderLeftColor: '#E5E7EB', marginHorizontal: 8 },
  lineDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, marginLeft: -4, marginBottom: -4, borderWidth: 1.5, borderColor: '#fff' },
  lineDotValue: { position: 'absolute', bottom: 10, left: -10, width: 28, textAlign: 'center', fontSize: 9, fontWeight: '600', color: '#374151' },
  lineLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  lineLabel: { fontSize: 9, color: '#9CA3AF', textAlign: 'center' },
});
