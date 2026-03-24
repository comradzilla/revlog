"use client";

import { useState, useEffect } from "react";

interface LedgerTransaction {
  dealId: string;
  dealName: string;
  pipelineName: string;
  type: string;
  delta: number;
  description: string;
  timestamp: string;
  timestampShort: string;
  balance: number;
}

interface PipelineLedgerProps {
  currentBalance: number;
  quarterBalance?: number | null;
  quarterLabel?: string | null;
  transactions: LedgerTransaction[];
  hiddenCount?: number;
}

function formatCurrency(value: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function deltaColor(delta: number): string {
  if (delta > 0) return "text-[var(--accent-green)]";
  if (delta < 0) return "text-[var(--accent-red)]";
  return "text-[var(--text-muted)]";
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${formatCurrency(delta)}`;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  amount_change: { label: "AMOUNT", color: "var(--accent-cyan)" },
  deal_created: { label: "CREATED", color: "var(--accent-green)" },
  closed_won: { label: "WON", color: "var(--accent-green)" },
  closed_lost: { label: "LOST", color: "var(--accent-red)" },
  reopened: { label: "REOPENED", color: "var(--accent-blue)" },
  date_moved_in: { label: "DATE IN", color: "var(--accent-green)" },
  date_moved_out: { label: "DATE OUT", color: "var(--accent-red)" },
};

export function PipelineLedger({ currentBalance, quarterBalance, quarterLabel, transactions, hiddenCount = 0 }: PipelineLedgerProps) {
  const [hiddenDismissed, setHiddenDismissed] = useState(false);

  // Reset dismissal when hidden count changes (e.g., filter change)
  useEffect(() => {
    setHiddenDismissed(false);
  }, [hiddenCount]);

  if (transactions.length === 0) {
    return (
      <div className="font-mono text-xs text-[var(--text-muted)] py-8 text-center">
        No pipeline value changes found for this period.
        {hiddenCount > 0 && (
          <div className="mt-2 text-[var(--text-muted)]">
            {hiddenCount} out-of-quarter change{hiddenCount !== 1 ? "s" : ""} not shown
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Balance header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-color)]">
        <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          {quarterLabel ? "Pipeline Balance" : "Current Pipeline Balance"}
        </span>
        <div className="flex items-center gap-2 font-mono">
          {quarterBalance != null && quarterLabel ? (
            <>
              <span className="text-[10px] text-[var(--text-muted)] uppercase">{quarterLabel}:</span>
              <span className="text-lg font-bold text-[var(--accent-cyan)]">
                {formatCurrency(quarterBalance, true)}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">/</span>
              <span className="text-[10px] text-[var(--text-muted)] uppercase">All:</span>
              <span className="text-sm text-[var(--text-secondary)]">
                {formatCurrency(currentBalance, true)}
              </span>
            </>
          ) : (
            <span className="text-lg font-bold text-[var(--accent-cyan)]">
              {formatCurrency(currentBalance, true)}
            </span>
          )}
        </div>
      </div>

      {/* Hidden out-of-quarter changes banner */}
      {hiddenCount > 0 && !hiddenDismissed && (
        <div className="flex items-center justify-between px-2 py-1.5 mb-3 rounded bg-[var(--bg-card-hover)] border border-[var(--border-color)] font-mono text-[10px] text-[var(--text-muted)]">
          <span>{hiddenCount} out-of-quarter change{hiddenCount !== 1 ? "s" : ""} hidden</span>
          <button
            onClick={() => setHiddenDismissed(true)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] ml-2 shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-0">
        {transactions.map((txn, i) => {
          const config = TYPE_CONFIG[txn.type] || { label: txn.type, color: "var(--text-muted)" };

          return (
            <a
              key={`${txn.dealId}-${txn.timestamp}-${i}`}
              href={`https://app.hubspot.com/contacts/3282655/record/0-3/${txn.dealId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors font-mono text-xs group"
            >
              {/* Line 1: timestamp + type badge + deal name */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[var(--text-muted)] shrink-0 text-right text-[10px] sm:text-xs whitespace-nowrap">
                  <span className="sm:hidden">{txn.timestampShort}</span>
                  <span className="hidden sm:inline">{txn.timestamp}</span>
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold shrink-0"
                  style={{
                    borderColor: `${config.color}44`,
                    backgroundColor: `${config.color}15`,
                    color: config.color,
                  }}
                >
                  {config.label}
                </span>
                <span className="text-[var(--text-secondary)] truncate min-w-0 group-hover:text-[var(--accent-blue)] transition-colors">
                  {txn.dealName}
                </span>
              </div>

              {/* Line 2 (mobile) / inline (desktop): description + delta + balance */}
              <div className="flex items-center gap-2 ml-auto min-w-0 overflow-hidden whitespace-nowrap shrink-0">
                {txn.description && (
                  <span className="text-[var(--text-muted)] text-[10px] truncate hidden sm:inline">
                    {txn.description}
                  </span>
                )}
                <span className={`font-semibold shrink-0 ${deltaColor(txn.delta)}`}>
                  {formatDelta(txn.delta)}
                </span>
                <span className="text-[var(--text-primary)] font-semibold shrink-0">
                  {formatCurrency(txn.balance, true)}
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
