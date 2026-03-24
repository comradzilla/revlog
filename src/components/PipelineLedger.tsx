"use client";

import { useState } from "react";

interface LedgerTransaction {
  dealId: string;
  dealName: string;
  pipelineName: string;
  type: string;
  delta: number;
  description: string;
  timestamp: string;
}

interface LedgerDay {
  date: string;
  dateLabel: string;
  dailyNet: number;
  endOfDayBalance: number;
  transactionCount: number;
  transactions: LedgerTransaction[];
}

interface PipelineLedgerProps {
  currentBalance: number;
  days: LedgerDay[];
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
};

export function PipelineLedger({ currentBalance, days }: PipelineLedgerProps) {
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  const toggleDay = (date: string) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  if (days.length === 0) {
    return (
      <div className="font-mono text-xs text-[var(--text-muted)] py-8 text-center">
        No pipeline value changes found for this period.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Current balance header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-color)]">
        <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
          Current Pipeline Balance
        </span>
        <span className="font-mono text-lg font-bold text-[var(--accent-cyan)]">
          {formatCurrency(currentBalance, true)}
        </span>
      </div>

      {/* Day rows */}
      <div className="space-y-0">
        {days.map((day) => {
          const isExpanded = expandedDays.has(day.date);

          return (
            <div key={day.date}>
              {/* Day summary row */}
              <button
                onClick={() => toggleDay(day.date)}
                className="w-full flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-0 py-2.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors font-mono text-xs cursor-pointer group"
              >
                {/* Left: chevron + date + count */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`text-[var(--text-muted)] transition-transform duration-200 ${
                      isExpanded ? "rotate-90" : ""
                    }`}
                  >
                    ▸
                  </span>
                  <span className="text-[var(--text-muted)] uppercase tracking-wider font-semibold whitespace-nowrap">
                    {day.dateLabel}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                    {day.transactionCount}
                  </span>
                </div>

                {/* Right: net + balance */}
                <div className="flex items-center gap-3 sm:ml-auto pl-5 sm:pl-0">
                  <span className="text-[10px] text-[var(--text-muted)] uppercase">net:</span>
                  <span className={`font-semibold whitespace-nowrap ${deltaColor(day.dailyNet)}`}>
                    {formatDelta(day.dailyNet)}
                  </span>
                  <span className="text-[var(--text-primary)] font-semibold whitespace-nowrap">
                    {formatCurrency(day.endOfDayBalance, true)}
                  </span>
                </div>
              </button>

              {/* Expanded transactions */}
              {isExpanded && (
                <div className="ml-3 sm:ml-5 mb-2 border-l-2 border-[var(--border-color)] pl-3 sm:pl-4 space-y-0">
                  {day.transactions.map((txn, i) => {
                    const config = TYPE_CONFIG[txn.type] || {
                      label: txn.type,
                      color: "var(--text-muted)",
                    };
                    const isLast = i === day.transactions.length - 1;

                    return (
                      <a
                        key={`${txn.dealId}-${txn.timestamp}-${i}`}
                        href={`https://app.hubspot.com/contacts/3282655/record/0-3/${txn.dealId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 py-1.5 px-1 rounded hover:bg-[var(--bg-card-hover)] transition-colors font-mono text-xs group/txn"
                      >
                        {/* Connector dot */}
                        <div className="absolute -left-[7px] w-2 h-2 rounded-full bg-[var(--border-color)]" style={{ display: "none" }} />

                        {/* Line 1 (mobile) / inline (desktop): timestamp + type badge + deal name */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[var(--text-muted)] shrink-0 w-[52px] text-right">
                            {txn.timestamp}
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
                          <span className="text-[var(--text-secondary)] truncate min-w-0 group-hover/txn:text-[var(--accent-blue)] transition-colors">
                            {txn.dealName}
                          </span>
                        </div>

                        {/* Line 2 (mobile) / inline (desktop): description + delta */}
                        <div className="flex items-center gap-2 sm:ml-auto pl-[56px] sm:pl-0 min-w-0">
                          {txn.description && (
                            <span className="text-[var(--text-muted)] text-[10px] truncate">
                              {txn.description}
                            </span>
                          )}
                          <span className={`font-semibold whitespace-nowrap shrink-0 ${deltaColor(txn.delta)}`}>
                            {formatDelta(txn.delta)}
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
