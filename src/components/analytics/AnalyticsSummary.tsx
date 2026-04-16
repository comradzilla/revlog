"use client";

interface AnalyticsSummaryProps {
  openPipeline: number;
  weightedPipeline: number;
  createdPipeline: number;
  createdCount: number;
  leftToRun: number;
  leftToRunCount: number;
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k >= 100 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

export function AnalyticsSummary({
  openPipeline,
  weightedPipeline,
  createdPipeline,
  createdCount,
  leftToRun,
  leftToRunCount,
}: AnalyticsSummaryProps) {
  const cards = [
    {
      label: "Open Pipeline",
      value: formatDollars(openPipeline),
      sub: `wtd: ${formatDollars(weightedPipeline)}`,
      color: "var(--accent-cyan)",
    },
    {
      label: "Weighted Pipeline",
      value: formatDollars(weightedPipeline),
      sub: "weighted by stage probability",
      color: "var(--accent-blue)",
    },
    {
      label: "Created (Period)",
      value: formatDollars(createdPipeline),
      sub: `${createdCount} deals`,
      color: "var(--accent-green)",
    },
    {
      label: "Left to Run",
      value: formatDollars(leftToRun),
      sub: `${leftToRunCount} deals closing in quarter`,
      color: "var(--accent-orange)",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        >
          <div className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider mb-2">
            {card.label}
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
