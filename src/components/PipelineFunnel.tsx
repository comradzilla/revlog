"use client";

interface StageData {
  stageId: string;
  label: string;
  count: number;
}

const STAGE_COLORS: Record<string, string> = {
  // Growth
  "01 - Prospecting": "var(--accent-blue)",
  "02 - Qualification": "var(--accent-purple)",
  "03 - Solutioning": "var(--accent-orange)",
  "04 - Proposal": "var(--accent-cyan)",
  "05 - Negotiation": "#f59e0b",
  "06 - Closed Won": "var(--accent-green)",
  "00 - Closed Lost": "var(--accent-red)",
  // Renewal
  "01 - Account Review": "var(--accent-blue)",
  "02 - Validate": "var(--accent-purple)",
  "03 - Propose": "var(--accent-orange)",
  "04 - Negotiate": "#f59e0b",
  "05 - Closed Won / Renewed": "var(--accent-green)",
  "00 - Closed Lost / Churn": "var(--accent-red)",
  // Renewal alt
  "BAU": "var(--accent-blue)",
  "Price Increase Notice": "var(--accent-purple)",
  "Renewal Nudge": "var(--accent-orange)",
  "Notice Nudge": "var(--accent-cyan)",
  "Negotiation": "#f59e0b",
  "Renewed": "var(--accent-green)",
  "Closed Lost": "var(--accent-red)",
};

function getStageColor(label: string): string {
  if (STAGE_COLORS[label]) return STAGE_COLORS[label];
  const l = label.toLowerCase();
  if (l.includes("closed won") || l.includes("renewed")) return "var(--accent-green)";
  if (l.includes("closed lost") || l.includes("churn")) return "var(--accent-red)";
  if (l.includes("negotiat")) return "#f59e0b";
  if (l.includes("propos")) return "var(--accent-cyan)";
  if (l.includes("prospect") || l.includes("review")) return "var(--accent-blue)";
  return "var(--text-muted)";
}

export function PipelineFunnel({
  stages,
  title = "Pipeline",
}: {
  stages: StageData[];
  title?: string;
}) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-[var(--accent-blue)]">
          &gt;
        </span>
        <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          {title}
        </h2>
      </div>
      <div className="space-y-2.5">
        {stages.map((stage) => {
          const color = getStageColor(stage.label);
          const pct = (stage.count / maxCount) * 100;
          return (
            <div key={stage.stageId} className="group">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                  {stage.label}
                </span>
                <span
                  className="font-mono text-xs font-bold"
                  style={{ color }}
                >
                  {stage.count}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--bg-primary)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${color}, ${color}88)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
