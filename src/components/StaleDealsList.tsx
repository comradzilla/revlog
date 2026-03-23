"use client";

import { useState } from "react";

interface StaleDeal {
  id: string;
  dealName: string;
  amount: number;
  stageName: string;
  pipelineName: string;
  ownerName: string;
  lastActivity: string | null;
  daysStale: number;
}

function formatDollars(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function StaleDealsList({
  deals,
  totalValue,
}: {
  deals: StaleDeal[];
  totalValue: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (deals.length === 0) return null;

  const shown = expanded ? deals : deals.slice(0, 5);

  return (
    <div className="card-glow rounded-lg border border-[var(--accent-orange)] border-opacity-30 bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--accent-orange)]">⚠</span>
          <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            Stale Deals
          </h2>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-orange-dim)] text-[var(--accent-orange)] border border-[var(--accent-orange)]">
            {deals.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">30d+ idle</span>
          <span className="font-mono text-[10px] font-semibold text-[var(--accent-orange)]">
            {formatDollars(totalValue)}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        {shown.map((deal) => (
          <a
            key={deal.id}
            href={`https://app.hubspot.com/contacts/3282655/record/0-3/${deal.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors group"
          >
            <span className="font-mono text-[10px] text-[var(--accent-orange)] shrink-0 w-8 text-right">
              {deal.daysStale}d
            </span>
            <span className="font-mono text-[10px] px-1 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-muted)] shrink-0">
              {deal.stageName.replace(/^\d+\s*-\s*/, "")}
            </span>
            <span className="font-mono text-xs text-[var(--text-secondary)] truncate flex-1 group-hover:text-[var(--accent-blue)] transition-colors">
              {deal.dealName}
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0 hidden lg:inline">
              {deal.ownerName}
            </span>
            <span className="font-mono text-xs text-[var(--accent-orange)] shrink-0">
              {formatDollars(deal.amount)}
            </span>
          </a>
        ))}
      </div>

      {deals.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="font-mono text-[10px] text-[var(--accent-orange)] mt-2 hover:underline cursor-pointer"
        >
          {expanded ? "show less" : `+ ${deals.length - 5} more`}
        </button>
      )}
    </div>
  );
}
