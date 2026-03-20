"use client";

interface Stats {
  totalOpenDeals: number;
  totalOpenValue: number;
  todayChanges: number;
  weekChanges: number;
  closedWonThisMonth: number;
  closedWonValue: number;
  quarterLabel?: string;
}

export function StatsCards({ stats }: { stats: Stats }) {
  const quarterDisplay = stats.quarterLabel
    ? stats.quarterLabel.replace("-", " ")
    : "MTD";

  const cards = [
    {
      label: "Open Pipeline (All)",
      value: `$${(stats.totalOpenValue / 1000).toFixed(0)}K`,
      sub: `${stats.totalOpenDeals} deals across all pipelines`,
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
      value: `$${(stats.closedWonValue / 1000).toFixed(0)}K`,
      sub: `${stats.closedWonThisMonth} deals`,
      color: "var(--accent-green)",
      icon: "$",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
