"use client";

import { useState } from "react";
import { HealthBadge } from "@/components/HealthBadge";
import { DealLink } from "@/components/DealLink";
import { TrendIcons } from "@/components/TrendIcons";
import type { HealthBucket, HealthPenalty } from "@/lib/health";

interface StaleDeal {
  id: string;
  dealName: string;
  amount: number;
  stageName: string;
  pipelineName: string;
  ownerName: string;
  nextStep: string | null;
  daysInStage: number;
  lastNextStepUpdate: string | null;
  healthScore?: number | null;
  healthBucket?: HealthBucket;
  healthPenalties?: HealthPenalty[];
  regressionCount?: number;
  slipCount?: number;
  amountNet?: number;
}

function formatDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function StaleDealsList({
  deals,
  totalValue,
  onOpenDeal,
}: {
  deals: StaleDeal[];
  totalValue: number;
  onOpenDeal?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (deals.length === 0) return null;

  const shown = expanded ? deals : deals.slice(0, 10);

  return (
    <div className="card-glow rounded-lg border border-[var(--accent-orange)] border-opacity-30 bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--accent-orange)]">⚠</span>
          <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            Stale Deals
          </h2>
          {/* Tooltip ? bubble */}
          <span className="relative group cursor-help">
            <span className="font-mono text-[10px] w-4 h-4 flex items-center justify-center rounded-full border border-[var(--text-muted)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:border-[var(--text-secondary)] transition-colors">
              ?
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 px-3 py-2 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-secondary)] font-mono text-[10px] leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 shadow-lg pointer-events-none">
              Deals in the same stage for 30+ days with no next step update in the last 14 days.
            </span>
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-orange-dim)] text-[var(--accent-orange)] border border-[var(--accent-orange)]">
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">in-stage</span>
          <span className="font-mono text-[10px] font-semibold text-[var(--accent-orange)]">
            {formatDollars(totalValue)}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {shown.map((deal) => (
          <div
            key={deal.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors"
            title={deal.nextStep ? `Next step: ${deal.nextStep}` : "No next step set"}
          >
            {deal.healthBucket && deal.healthScore != null ? (
              <HealthBadge
                score={deal.healthScore}
                bucket={deal.healthBucket}
                penalties={deal.healthPenalties}
              />
            ) : (
              <span className="inline-block w-[28px] shrink-0" />
            )}
            <span className="font-mono text-[10px] text-[var(--accent-orange)] shrink-0 w-8 text-right">
              {deal.daysInStage}d
            </span>
            <span className="font-mono text-[10px] px-1 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-muted)] shrink-0">
              {deal.stageName.replace(/^\d+\s*-\s*/, "")}
            </span>
            <DealLink
              dealId={deal.id}
              dealName={deal.dealName}
              onOpenDeal={onOpenDeal}
              className="font-mono text-xs text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors"
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
            <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 hidden lg:inline">
              {deal.ownerName}
            </span>
            <span className="font-mono text-xs text-[var(--accent-orange)] shrink-0">
              {formatDollars(deal.amount)}
            </span>
          </div>
        ))}
      </div>

      {deals.length > 10 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="font-mono text-[10px] text-[var(--accent-orange)] mt-2 hover:underline cursor-pointer"
        >
          {expanded ? "show less" : `+ ${deals.length - 10} more`}
        </button>
      )}
    </div>
  );
}
