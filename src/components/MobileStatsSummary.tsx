"use client";

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

interface Stats {
  totalOpenValue: number;
  weightedPipelineValue: number;
  todayChanges: number;
  weekChanges: number;
  closedWonValue: number;
  closedLostValue: number;
}

export function MobileStatsSummary({ stats }: { stats: Stats }) {
  return (
    <div className="sm:hidden overflow-x-auto">
      <div className="flex items-center gap-3 font-mono text-[11px] whitespace-nowrap py-2 px-1">
        <span className="text-[var(--text-primary)]">
          <span className="text-[var(--accent-cyan)]">{formatCompact(stats.totalOpenValue)}</span>
          <span className="text-[var(--text-muted)]"> pipeline</span>
        </span>
        <span className="text-[var(--border-color)]">|</span>
        <span className="text-[var(--text-primary)]">
          <span className="text-[var(--accent-orange)]">{stats.todayChanges}</span>
          <span className="text-[var(--text-muted)]"> today</span>
        </span>
        <span className="text-[var(--border-color)]">|</span>
        <span className="text-[var(--text-primary)]">
          <span className="text-[var(--accent-green)]">{formatCompact(stats.closedWonValue)}</span>
          <span className="text-[var(--text-muted)]"> won</span>
        </span>
        {stats.closedLostValue > 0 && (
          <>
            <span className="text-[var(--border-color)]">|</span>
            <span className="text-[var(--text-primary)]">
              <span className="text-[var(--accent-red)]">{formatCompact(stats.closedLostValue)}</span>
              <span className="text-[var(--text-muted)]"> lost</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
