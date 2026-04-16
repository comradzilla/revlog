"use client";

import { useMemo } from "react";
import { Liveline } from "liveline";

interface DailyPoint {
  day: string;
  value: number;
  count: number;
}

interface CumulativePoint {
  day: string;
  value: number;
}

interface PeriodData {
  daily: DailyPoint[];
  cumulative: CumulativePoint[];
  total: number;
  dealCount: number;
}

interface PipelineCreatedChartProps {
  primary: PeriodData | null;
  comparison: PeriodData | null;
  periodChange: {
    valueDelta: number;
    countDelta: number;
    percentChange: number;
  } | null;
  comparisonEnabled: boolean;
  theme: string;
}

function formatCompact(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function dayToUnix(day: string): number {
  return Math.floor(new Date(day).getTime() / 1000);
}

export function PipelineCreatedChart({
  primary,
  comparison,
  periodChange,
  comparisonEnabled,
  theme,
}: PipelineCreatedChartProps) {
  const livelineTheme = theme === "light" ? "light" : "dark";

  const primaryPoints = useMemo(() => {
    if (!primary?.cumulative?.length) return null;
    return primary.cumulative.map((d) => ({
      time: dayToUnix(d.day),
      value: d.value,
    }));
  }, [primary]);

  const comparisonPoints = useMemo(() => {
    if (!comparison?.cumulative?.length) return null;
    return comparison.cumulative.map((d) => ({
      time: dayToUnix(d.day),
      value: d.value,
    }));
  }, [comparison]);

  const showComparison =
    comparisonEnabled && comparisonPoints && comparisonPoints.length > 1;

  // When showing comparison, use multi-series
  const livelineSeries = useMemo(() => {
    if (!showComparison || !primaryPoints) return undefined;
    const currentValue = primaryPoints.length > 0 ? primaryPoints[primaryPoints.length - 1].value : 0;
    const prevValue = comparisonPoints!.length > 0 ? comparisonPoints![comparisonPoints!.length - 1].value : 0;
    return [
      {
        id: "current",
        label: "Current Period",
        data: primaryPoints,
        value: currentValue,
        color: "#10b981",
      },
      {
        id: "previous",
        label: "Previous Period",
        data: comparisonPoints!,
        value: prevValue,
        color: "#10b98180", // 50% opacity green
      },
    ];
  }, [showComparison, primaryPoints, comparisonPoints]);

  // Combined data for the required `data` prop
  const allData = useMemo(() => {
    if (!primaryPoints || primaryPoints.length === 0) {
      return [{ time: Math.floor(Date.now() / 1000), value: 0 }];
    }
    if (showComparison && comparisonPoints) {
      const merged = [...primaryPoints, ...comparisonPoints];
      merged.sort((a, b) => a.time - b.time);
      return merged;
    }
    return primaryPoints;
  }, [primaryPoints, comparisonPoints, showComparison]);

  const allValue = useMemo(() => {
    return allData.length > 0 ? allData[allData.length - 1].value : 0;
  }, [allData]);

  const hasData = primaryPoints && primaryPoints.length > 1;

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          Pipeline Created
        </h3>
        {primary && (
          <div className="flex items-center gap-2 font-mono text-[10px]">
            <span className="font-semibold text-[var(--accent-green)]">
              {formatCompact(primary.total)}
            </span>
            <span className="text-[var(--text-muted)]">
              ({primary.dealCount} deals)
            </span>
          </div>
        )}
      </div>

      {/* Chart */}
      <div style={{ height: 180, width: "100%" }}>
        {hasData ? (
          <Liveline
            data={allData}
            value={allValue}
            series={livelineSeries}
            color="#10b981"
            theme={livelineTheme}
            fill={true}
            scrub={true}
            grid={true}
            badge={false}
            window={86400 * 95}
            formatValue={(v: number) => formatCompact(v)}
            formatTime={(t: number) =>
              new Date(t * 1000).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }
          />
        ) : (
          <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
            {primaryPoints?.length === 1
              ? `${formatCompact(primary?.total ?? 0)} on one day`
              : "No pipeline created data"}
          </div>
        )}
      </div>

      {/* Period comparison summary */}
      {comparisonEnabled && periodChange && (
        <div className="mt-3 font-mono text-[10px]">
          <span
            className={`font-semibold ${
              periodChange.valueDelta >= 0
                ? "text-[var(--accent-green)]"
                : "text-[var(--accent-red)]"
            }`}
          >
            {periodChange.valueDelta >= 0 ? "+" : ""}
            {formatCompact(periodChange.valueDelta)} (
            {periodChange.percentChange >= 0 ? "+" : ""}
            {periodChange.percentChange.toFixed(0)}%)
          </span>
          <span className="text-[var(--text-muted)]"> vs previous period</span>
          {periodChange.countDelta !== 0 && (
            <span className="text-[var(--text-muted)] ml-2">
              ({periodChange.countDelta >= 0 ? "+" : ""}
              {periodChange.countDelta} deals)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
