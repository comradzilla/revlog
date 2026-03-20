"use client";

interface Deal {
  id: string;
  dealName: string;
  pipelineName: string;
  currentStageName: string;
  stageNumber: number;
  amount: number;
  lastModified: string;
  ownerName: string;
  changeType?: string;
}

function getStageClass(stageName: string): string {
  const s = stageName.toLowerCase();
  if (s.includes("prospecting") || s.includes("prospect")) return "stage-prospecting";
  if (s.includes("qualification") || s.includes("validate")) return "stage-qualification";
  if (s.includes("solutioning") || s.includes("exploration")) return "stage-solutioning";
  if (s.includes("proposal") || s.includes("propose")) return "stage-proposal";
  if (s.includes("negotiation") || s.includes("negotiate")) return "stage-negotiation";
  if (s.includes("closed won") || s.includes("renewed")) return "stage-closed-won";
  if (s.includes("closed lost") || s.includes("churn")) return "stage-closed-lost";
  return "stage-prospecting";
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

export function RecentDeals({ deals }: { deals: Deal[] }) {
  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-[var(--accent-green)]">$</span>
        <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Recent Stage / Amount Changes
        </h2>
      </div>

      <div className="space-y-1">
        {deals.slice(0, 15).map((deal) => (
          <a
            key={deal.id}
            href={`https://app.hubspot.com/contacts/3282655/record/0-3/${deal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 py-2 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors group"
          >
            <span className="font-mono text-[10px] text-[var(--text-muted)] w-6 text-right shrink-0">
              {timeAgo(deal.lastModified)}
            </span>

            {deal.changeType && (
              <span
                className={`font-mono text-[10px] px-1 py-0.5 rounded border shrink-0 ${
                  deal.changeType === "dealstage"
                    ? "border-[var(--accent-purple)] text-[var(--accent-purple)] bg-[var(--accent-purple)]15"
                    : "border-[var(--accent-cyan)] text-[var(--accent-cyan)] bg-[var(--accent-cyan)]15"
                }`}
              >
                {deal.changeType === "dealstage" ? "STG" : "AMT"}
              </span>
            )}

            <span
              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${getStageClass(deal.currentStageName)}`}
            >
              {deal.currentStageName.replace(/^\d+\s*-\s*/, "")}
            </span>

            <span className="font-mono text-xs text-[var(--text-primary)] truncate flex-1 group-hover:text-white transition-colors">
              {deal.dealName}
            </span>

            <span className="font-mono text-xs text-[var(--accent-green)] shrink-0">
              ${deal.amount >= 1000
                ? `${(deal.amount / 1000).toFixed(0)}K`
                : deal.amount.toFixed(0)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
