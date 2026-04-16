"use client";

import { useMemo, useCallback } from "react";
import { Liveline } from "liveline";

interface SeriesDataPoint {
  time: number;
  value: number;
}

interface ChartSeries {
  id: string;
  label: string;
  data: SeriesDataPoint[];
}

interface PipelineOverTimeChartProps {
  series: ChartSeries[];
  summary: {
    current: number;
    start: number;
    change: number;
    changePercent: number;
  } | null;
  breakdown: string;
  setBreakdown: (b: string) => void;
  metric: string;
  setMetric: (m: string) => void;
  theme: string;
  onDataPointClick?: (time: number) => void;
}

const BREAKDOWN_OPTIONS = [
  { key: "total", label: "Total" },
  { key: "stage", label: "By Stage" },
  { key: "type", label: "By Type" },
];

const METRIC_OPTIONS = [
  { key: "value", label: "$ Value" },
  { key: "count", label: "# Count" },
  { key: "weighted", label: "Weighted" },
];

const SERIES_COLORS = ["#06b6d4", "#10b981", "#f59e0b", "#3b82f6", "#a855f7"];

function formatCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

const btnBase =
  "font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer";
const btnActive =
  "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]";
const btnInactive =
  "border-[var(--border-color)] bg-transparent text-[var(--text-muted)]";

export function PipelineOverTimeChart({
  series,
  summary,
  breakdown,
  setBreakdown,
  metric,
  setMetric,
  theme,
  onDataPointClick,
}: PipelineOverTimeChartProps) {
  const livelineTheme = theme === "light" ? "light" : "dark";

  // For single-series mode, use data/value directly
  const isSingle = series.length <= 1;
  const primaryData = useMemo(() => {
    if (series.length === 0) return [];
    return series[0].data;
  }, [series]);
  const primaryValue = useMemo(() => {
    if (series.length === 0) return 0;
    const pts = series[0].data;
    return pts.length > 0 ? pts[pts.length - 1].value : 0;
  }, [series]);

  // For multi-series mode, build Liveline series array
  const livelineSeries = useMemo(() => {
    if (isSingle) return undefined;
    return series.map((s, i) => ({
      id: s.id,
      label: s.label,
      data: s.data,
      value: s.data.length > 0 ? s.data[s.data.length - 1].value : 0,
      color: SERIES_COLORS[i % SERIES_COLORS.length],
    }));
  }, [series, isSingle]);

  // All data flattened for `data` prop (required even with series)
  const allData = useMemo(() => {
    if (isSingle) return primaryData;
    // Combine all data points, sorted by time
    const merged = series.flatMap((s) => s.data);
    merged.sort((a, b) => a.time - b.time);
    return merged.length > 0 ? merged : [{ time: Math.floor(Date.now() / 1000), value: 0 }];
  }, [series, isSingle, primaryData]);

  const allValue = useMemo(() => {
    if (isSingle) return primaryValue;
    return allData.length > 0 ? allData[allData.length - 1].value : 0;
  }, [allData, isSingle, primaryValue]);

  const handleChartClick = useCallback(() => {
    // No-op container click; onHover data point handling would go here
    // if Liveline exposes click coordinates
  }, []);

  const hasData = series.length > 0 && series.some((s) => s.data.length > 1);

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          Pipeline Over Time
        </h3>

        <div className="flex items-center gap-2">
          {/* Breakdown toggle */}
          <div className="flex items-center gap-1">
            {BREAKDOWN_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setBreakdown(opt.key)}
                className={`${btnBase} ${
                  breakdown === opt.key ? btnActive : btnInactive
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-[var(--border-color)]" />

          {/* Metric toggle */}
          <div className="flex items-center gap-1">
            {METRIC_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setMetric(opt.key)}
                className={`${btnBase} ${
                  metric === opt.key ? btnActive : btnInactive
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div
        style={{ height: 220, width: "100%" }}
        onClick={handleChartClick}
      >
        {hasData ? (
          <Liveline
            data={allData}
            value={allValue}
            series={livelineSeries}
            color="#06b6d4"
            theme={livelineTheme}
            fill={true}
            scrub={true}
            grid={true}
            badge={true}
            window={86400 * 95}
            formatValue={(v: number) => formatCompact(v)}
            formatTime={(t: number) =>
              new Date(t * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
            onHover={(point: { time: number; value: number } | null) => {
              if (point && onDataPointClick) {
                // Store for click handler — actual click triggers the drill-down
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
            No data for selected period
          </div>
        )}
      </div>

      {/* Summary badge */}
      {summary && (
        <div className="mt-3 flex items-center gap-2 font-mono text-[10px]">
          <span className="text-[var(--text-muted)]">
            Current:{" "}
            <span className="text-[var(--text-primary)] font-semibold">
              {formatCompact(summary.current)}
            </span>
          </span>
          <span className="text-[var(--text-muted)]">|</span>
          <span className="text-[var(--text-muted)]">
            Start:{" "}
            <span className="text-[var(--text-primary)] font-semibold">
              {formatCompact(summary.start)}
            </span>
          </span>
          <span className="text-[var(--text-muted)]">|</span>
          <span className="text-[var(--text-muted)]">
            Change:{" "}
            <span
              className={`font-semibold ${
                summary.change >= 0
                  ? "text-[var(--accent-green)]"
                  : "text-[var(--accent-red)]"
              }`}
            >
              {summary.change >= 0 ? "+" : ""}
              {formatCompact(summary.change)} (
              {summary.changePercent >= 0 ? "+" : ""}
              {summary.changePercent.toFixed(1)}%)
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
