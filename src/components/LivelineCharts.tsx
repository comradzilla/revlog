"use client";

import { useMemo } from "react";
import { Liveline } from "liveline";

interface WowData {
  thisWeek: { day: string; value: number }[];
  lastWeek: { day: string; value: number }[];
  thisWeekTotal: number;
  lastWeekTotal: number;
  wow: number;
}

interface BookingsData {
  daily: { day: string; value: number }[];
  cumulative: { day: string; value: number }[];
  total: number;
}

interface NetMovementData {
  days: { day: string; created: number; won: number; lost: number; net: number }[];
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
  wowData,
  bookingsData,
  netMovementData,
  theme,
}: {
  wowData: WowData | null;
  bookingsData: BookingsData | null;
  netMovementData: NetMovementData | null;
  theme: string;
}) {
  const livelineTheme = theme === "light" ? "light" : "dark";

  // Pipeline Created WoW — multi-series
  const wowSeries = useMemo(() => {
    if (!wowData) return null;
    return [
      {
        id: "thisWeek",
        data: wowData.thisWeek.map((d) => ({ time: dayToUnix(d.day), value: d.value })),
        value: wowData.thisWeekTotal,
        color: "#10b981",
        label: "This Week",
      },
      {
        id: "lastWeek",
        data: wowData.lastWeek.map((d) => ({ time: dayToUnix(d.day), value: d.value })),
        value: wowData.lastWeekTotal,
        color: "#6b7280",
        label: "Last Week",
      },
    ];
  }, [wowData]);

  // Bookings — cumulative single line
  const bookingsPoints = useMemo(() => {
    if (!bookingsData?.cumulative?.length) return null;
    return bookingsData.cumulative.map((d) => ({ time: dayToUnix(d.day), value: d.value }));
  }, [bookingsData]);

  // Net Movement — single line
  const netPoints = useMemo(() => {
    if (!netMovementData?.days?.length) return null;
    return netMovementData.days.map((d) => ({ time: dayToUnix(d.day), value: d.net }));
  }, [netMovementData]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Pipeline Created WoW */}
      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Pipeline Created WoW
          </h3>
          {wowData && (
            <span className="font-mono text-[10px] font-semibold">
              <span className="text-[var(--accent-green)]">{formatCompact(wowData.thisWeekTotal)}</span>
              {wowData.wow !== 0 && (
                <span className={`ml-1 ${wowData.wow > 0 ? "text-[var(--accent-green)]" : "text-[var(--accent-red)]"}`}>
                  {wowData.wow > 0 ? "↑" : "↓"}{Math.abs(wowData.wow).toFixed(0)}%
                </span>
              )}
            </span>
          )}
        </div>
        <div style={{ height: 120, width: "100%" }}>
          {wowSeries && wowSeries[0].data.length > 0 ? (
            <Liveline
              data={wowSeries[0].data}
              value={wowSeries[0].value}
              series={wowSeries}
              color="#10b981"
              theme={livelineTheme}
              fill={true}
              grid={true}
              badge={false}
              showValue={false}
              momentum={false}
              scrub={true}
              formatValue={(v: number) => formatCompact(v)}
              formatTime={(t: number) => new Date(t * 1000).toLocaleDateString("en-US", { weekday: "short" })}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
              No data this week
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
          {bookingsPoints && bookingsPoints.length > 0 ? (
            <Liveline
              data={bookingsPoints}
              value={bookingsData?.total ?? 0}
              color="#10b981"
              theme={livelineTheme}
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
              No bookings data
            </div>
          )}
        </div>
      </div>

      {/* Net Pipeline Movement */}
      <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Net Pipeline Movement
          </h3>
          {netMovementData && netMovementData.days.length > 0 && (
            <span className={`font-mono text-[10px] font-semibold ${
              netMovementData.days.reduce((s, d) => s + d.net, 0) >= 0
                ? "text-[var(--accent-green)]"
                : "text-[var(--accent-red)]"
            }`}>
              {netMovementData.days.reduce((s, d) => s + d.net, 0) >= 0 ? "+" : ""}
              {formatCompact(netMovementData.days.reduce((s, d) => s + d.net, 0))}
            </span>
          )}
        </div>
        <div style={{ height: 120, width: "100%" }}>
          {netPoints && netPoints.length > 0 ? (
            <Liveline
              data={netPoints}
              value={netPoints[netPoints.length - 1]?.value ?? 0}
              color="#3b82f6"
              theme={livelineTheme}
              fill={true}
              grid={true}
              badge={false}
              showValue={false}
              momentum={true}
              scrub={true}
              referenceLine={{ value: 0, label: "Zero" }}
              formatValue={(v: number) => `${v >= 0 ? "+" : ""}${formatCompact(v)}`}
              formatTime={(t: number) => new Date(t * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            />
          ) : (
            <div className="h-full flex items-center justify-center font-mono text-[10px] text-[var(--text-muted)]">
              No movement data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
