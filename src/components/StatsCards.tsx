"use client";

interface Stats {
  totalOpenDeals: number;
  totalOpenValue: number;
  weightedPipelineValue: number;
  todayChanges: number;
  weekChanges: number;
  closedWonThisMonth: number;
  closedWonValue: number;
  closedLostThisMonth: number;
  closedLostValue: number;
  quarterLabel?: string;
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function StatsCards({ stats }: { stats: Stats }) {
  const quarterDisplay = stats.quarterLabel
    ? stats.quarterLabel.replace(/,/g, " + ").replace(/-/g, " ")
    : "MTD";

  const winRate = (stats.closedWonThisMonth + stats.closedLostThisMonth) > 0
    ? Math.round((stats.closedWonThisMonth / (stats.closedWonThisMonth + stats.closedLostThisMonth)) * 100)
    : 0;

  const avgDealSize = stats.closedWonThisMonth > 0
    ? stats.closedWonValue / stats.closedWonThisMonth
    : 0;

  const cards = [
    {
      label: "Open Pipeline (All)",
      value: formatDollars(stats.totalOpenValue),
      sub: `${stats.totalOpenDeals} deals · wtd: ${formatDollars(stats.weightedPipelineValue)}`,
      color: "var(--accent-blue)",
      icon: "~",
    },
    {
      label: "Changes Today",
      value: stats.todayChanges.toString(),
      sub: "stage + amount",
      color: "var(--accent-orange)",
      icon: ">",
    },
    {
      label: "Changes (7d)",
      value: stats.weekChanges.toString(),
      sub: "this week",
      color: "var(--accent-purple)",
      icon: "#",
    },
    {
      label: `Closed Won (${quarterDisplay})`,
      value: formatDollars(stats.closedWonValue),
      sub: `${stats.closedWonThisMonth} deals · avg: ${formatDollars(avgDealSize)}${winRate > 0 ? ` · ${winRate}% win` : ""}`,
      color: "var(--accent-green)",
      icon: "$",
    },
    {
      label: `Closed Lost (${quarterDisplay})`,
      value: formatDollars(stats.closedLostValue),
      sub: `${stats.closedLostThisMonth} deals`,
      color: "var(--accent-red)",
      icon: "x",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 hover:bg-[var(--bg-card-hover)] transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
              {card.label}
            </span>
            <span
              className="font-mono text-xs font-bold"
              style={{ color: card.color }}
            >
              {card.icon}
            </span>
          </div>
          <div
            className="font-mono text-2xl font-bold mb-1"
            style={{ color: card.color }}
          >
            {card.value}
          </div>
          <div className="font-mono text-xs text-[var(--text-muted)]">
            {card.sub}
          </div>
        </div>
      ))}
    </div>
  );
}
