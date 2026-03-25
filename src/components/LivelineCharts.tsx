"use client";

import { useMemo } from "react";
import { Liveline } from "liveline";
import type { CandlePoint } from "liveline";

interface PipelineCreatedData {
  daily: { day: string; value: number; count: number }[];
  cumulative: { day: string; value: number }[];
  total: number;
  dealCount: number;
}

interface BookingsData {
  daily: { day: string; value: number }[];
  cumulative: { day: string; value: number }[];
  total: number;
}

interface NetMovementData {
  candles: { day: string; time: number; open: number; high: number; low: number; close: number; net: number }[];
  lineData: { time: number; value: number }[];
  currentValue: number;
  startValue: number;
  netChange: number;
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

export function LivelineCharts({
  pipelineCreatedData,
  bookingsData,
  netMovementData,
  theme,
}: {
  pipelineCreatedData: PipelineCreatedData | null;
  bookingsData: BookingsData | null;
  netMovementData: NetMovementData | null;
  theme: string;
}) {
  const livelineTheme = theme === "light" ? "light" : "dark";

  // Pipeline Created — cumulative line over the quarter
  const createdPoints = useMemo(() => {
    if (!pipelineCreatedData?.cumulative?.length) return null;
    return pipelineCreatedData.cumulative.map((d) => ({ time: dayToUnix(d.day), value: d.value }));
  }, [pipelineCreatedData]);

  // Bookings — cumulative single line
  const bookingsPoints = useMemo(() => {
    if (!bookingsData?.cumulative?.length) return null;
    return bookingsData.cumulative.map((d) => ({ time: dayToUnix(d.day), value: d.value }));
  }, [bookingsData]);

  // Net Movement — candlestick data
  const candleData = useMemo(() => {
    if (!netMovementData?.candles?.length) return null;
    return netMovementData.candles.map((c): CandlePoint => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
  }, [netMovementData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Pipeline Created — Quarter View */}
      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Pipeline Created
          </h3>
          {pipelineCreatedData && (
            <span className="font-mono text-[10px] font-semibold">
              <span className="text-[var(--accent-green)]">{formatCompact(pipelineCreatedData.total)}</span>
              <span className="text-[var(--text-muted)] ml-1">({pipelineCreatedData.dealCount} deals)</span>
            </span>
          )}
        </div>
        <div style={{ height: 120, width: "100%" }}>
          {createdPoints && createdPoints.length > 1 ? (
            <Liveline
              data={createdPoints}
              value={pipelineCreatedData?.total ?? 0}
              color="#10b981"
              theme={livelineTheme}
              window={86400 * 95}
              fill={true}
              grid={true}
              badge={false}
              showValue={false}
              momentum={true}
              scrub={true}
              formatValue={(v: number) => formatCompact(v)}
              formatTime={(t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
              {createdPoints?.length === 1 ? `${formatCompact(pipelineCreatedData?.total ?? 0)} on one day` : "No pipeline created"}
            </div>
          )}
        </div>
      </div>

      {/* Bookings Trend */}
      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Bookings (Cumulative)
          </h3>
          {bookingsData && (
            <span className="font-mono text-[10px] font-semibold text-[var(--accent-green)]">
              {formatCompact(bookingsData.total)}
            </span>
          )}
        </div>
        <div style={{ height: 120, width: "100%" }}>
          {bookingsPoints && bookingsPoints.length > 1 ? (
            <Liveline
              data={bookingsPoints}
              value={bookingsData?.total ?? 0}
              color="#10b981"
              theme={livelineTheme}
              window={86400 * 95}
              fill={true}
              grid={true}
              badge={false}
              showValue={false}
              momentum={true}
              scrub={true}
              formatValue={(v: number) => formatCompact(v)}
              formatTime={(t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
              {bookingsPoints?.length === 1 ? `${formatCompact(bookingsData?.total ?? 0)} on one day` : "No bookings data"}
            </div>
          )}
        </div>
      </div>

      {/* Net Pipeline Movement — Candlestick */}
      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Pipeline Balance
          </h3>
          {netMovementData && (
            <span className={`font-mono text-[10px] font-semibold ${
              netMovementData.netChange >= 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"
            }`}>
              {netMovementData.netChange >= 0 ? "+" : ""}{formatCompact(netMovementData.netChange)}
            </span>
          )}
        </div>
        <div style={{ height: 120, width: "100%" }}>
          {candleData && candleData.length > 1 ? (
            <Liveline
              mode="candle"
              candles={candleData}
              candleWidth={86400}
              data={netMovementData?.lineData ?? []}
              value={netMovementData?.currentValue ?? 0}
              color="#3b82f6"
              theme={livelineTheme}
              window={86400 * 95}
              grid={true}
              badge={false}
              showValue={false}
              scrub={true}
              formatValue={(v: number) => formatCompact(v)}
              formatTime={(t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
              No snapshot data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
