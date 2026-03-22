"use client";

interface StageData {
  stageId: string;
  label: string;
  count: number;
  total_value: number;
}

interface FilterOption {
  key: string;
  label: string;
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
  "Closed Won / Renewed": "var(--accent-green)",
  // VS-Sales
  "Closed Won": "var(--accent-green)",
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

function formatValue(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function PipelineFunnel({
  stages,
  title = "Pipeline",
  totalCount = 0,
  totalValue = 0,
  accentColor,
  filterOptions,
  activeFilter,
  onFilterChange,
}: {
  stages: StageData[];
  title?: string;
  totalCount?: number;
  totalValue?: number;
  accentColor?: string;
  filterOptions?: FilterOption[];
  activeFilter?: string;
  onFilterChange?: (key: string) => void;
}) {
  const accent = accentColor || "var(--accent-blue)";
  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: accent }}>
            &gt;
          </span>
          <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            {title}
          </h2>
        </div>
        {totalCount > 0 && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              {totalCount} <span className="text-[var(--text-muted)]">deals</span>
            </span>
            <span className="font-mono text-[10px] font-semibold text-[var(--accent-green)]">
              {formatValue(totalValue)}
            </span>
          </div>
        )}
      </div>

      {/* Optional inline pipeline toggle */}
      {filterOptions && filterOptions.length > 1 && onFilterChange && (
        <div className="flex items-center gap-1 mb-3">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onFilterChange(opt.key)}
              className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                activeFilter === opt.key
                  ? "border-[var(--accent-orange)] bg-[var(--accent-orange-dim)] text-[var(--accent-orange)]"
                  : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

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
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">
                    {formatValue(stage.total_value || 0)}
                  </span>
                  <span
                    className="font-mono text-xs font-bold w-8 text-right"
                    style={{ color }}
                  >
                    {stage.count}
                  </span>
                </div>
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
