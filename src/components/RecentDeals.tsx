"use client";

import { HealthBadge } from "@/components/HealthBadge";
import { DealLink } from "@/components/DealLink";
import { TrendIcons } from "@/components/TrendIcons";
import type { HealthBucket, HealthPenalty } from "@/lib/health";

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
  dealType?: string;
  stageEnteredAt?: string;
  healthScore?: number | null;
  healthBucket?: HealthBucket;
  healthPenalties?: HealthPenalty[];
  regressionCount?: number;
  slipCount?: number;
  amountNet?: number;
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

function getDealTypeLabel(dt: string | undefined): string | null {
  if (!dt) return null;
  const t = dt.toLowerCase();
  if (t.includes("new")) return "NEW";
  if (t.includes("exist") || t.includes("upsell")) return "UPSELL";
  if (t.includes("renew")) return "RENEWAL";
  return dt.toUpperCase();
}

function getDealTypeColor(dt: string | undefined): string {
  if (!dt) return "var(--text-muted)";
  const t = dt.toLowerCase();
  if (t.includes("new")) return "var(--accent-blue)";
  if (t.includes("exist") || t.includes("upsell")) return "var(--accent-orange)";
  if (t.includes("renew")) return "var(--accent-cyan)";
  return "var(--text-muted)";
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function daysInStage(stageEnteredAt: string | undefined): number | null {
  if (!stageEnteredAt) return null;
  const entered = new Date(stageEnteredAt).getTime();
  if (isNaN(entered)) return null;
  return Math.floor((Date.now() - entered) / 86400000);
}

function getDaysColor(days: number): string {
  if (days < 14) return "var(--accent-green)";
  if (days < 30) return "var(--accent-orange)";
  return "var(--accent-red)";
}

export function RecentDeals({ deals, onOpenDeal }: { deals: Deal[]; onOpenDeal?: (id: string) => void }) {
  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="font-mono text-xs text-[var(--accent-green)]">$</span>
        <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Recent Stage / Amount Changes
        </h2>
      </div>

      <div className="space-y-1">
        {deals.slice(0, 15).map((deal) => {
          const typeLabel = getDealTypeLabel(deal.dealType);
          const typeColor = getDealTypeColor(deal.dealType);
          const days = daysInStage(deal.stageEnteredAt);
          return (
            <div
              key={deal.id}
              className="flex items-center gap-2 py-2 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors"
            >
              <span className="font-mono text-[10px] text-[var(--text-muted)] w-6 text-right shrink-0">
                {timeAgo(deal.lastModified)}
              </span>

              {deal.changeType && (
                <span
                  className={`font-mono text-[10px] px-1 py-0.5 rounded border shrink-0 ${
                    deal.changeType === "dealstage"
                      ? "border-[var(--accent-purple)] text-[var(--accent-purple)]"
                      : deal.changeType === "created"
                      ? "border-[var(--accent-green)] text-[var(--accent-green)]"
                      : "border-[var(--accent-cyan)] text-[var(--accent-cyan)]"
                  }`}
                  style={{
                    backgroundColor: deal.changeType === "dealstage"
                      ? "rgba(139, 92, 246, 0.15)"
                      : deal.changeType === "created"
                      ? "rgba(16, 185, 129, 0.15)"
                      : "rgba(6, 182, 212, 0.15)",
                  }}
                >
                  {deal.changeType === "dealstage" ? "STG" : deal.changeType === "created" ? "NEW" : "AMT"}
                </span>
              )}

              {typeLabel && (
                <span
                  className="font-mono text-[10px] px-1 py-0.5 rounded border shrink-0"
                  style={{
                    borderColor: `${typeColor}66`,
                    backgroundColor: `${typeColor}15`,
                    color: typeColor,
                  }}
                >
                  {typeLabel}
                </span>
              )}

              <span
                className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 ${getStageClass(deal.currentStageName)}`}
              >
                {deal.currentStageName.replace(/^\d+\s*-\s*/, "")}
              </span>

              {/* Time in stage badge */}
              {days !== null && days >= 0 && (
                <span
                  className="font-mono text-[9px] shrink-0"
                  style={{ color: getDaysColor(days) }}
                >
                  {days}d
                </span>
              )}

              <DealLink
                dealId={deal.id}
                dealName={deal.dealName}
                onOpenDeal={onOpenDeal}
                className="font-mono text-xs text-[var(--text-primary)] hover:text-[var(--accent-blue)] transition-colors"
                wrapperClassName="flex-1 min-w-0"
              />

              <TrendIcons
                bucket={deal.healthBucket}
                amount={deal.amount}
                momentumSignals={{
                  regression_count: deal.regressionCount,
                  slip_count: deal.slipCount,
                  amount_net: deal.amountNet,
                }}
              />

              {deal.healthBucket && deal.healthScore != null && (
                <HealthBadge
                  score={deal.healthScore}
                  bucket={deal.healthBucket}
                  penalties={deal.healthPenalties}
                />
              )}

              <span className="font-mono text-xs text-[var(--accent-green)] shrink-0">
                ${deal.amount >= 1000
                  ? `${(deal.amount / 1000).toFixed(0)}K`
                  : deal.amount.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
