"use client";

import { useState, useEffect, useCallback } from "react";

interface Deal {
  id: string;
  dealName: string;
  amount: number;
  stageName: string;
  pipelineName: string;
  ownerName: string;
  daysInStage: number;
  closeDate: string | null;
  nextStep: string | null;
  dealType: string | null;
  health: "green" | "amber" | "red";
  priorityScore: number;
  flags: string[];
}

interface DealDrilldownTableProps {
  deals: Deal[];
  totalCount: number;
  totalValue: number;
  sort: string;
  order: string;
  onSortChange: (sort: string, order: string) => void;
  onLoadMore?: () => void;
  onClose: () => void;
  title?: string;
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

const COLUMNS = [
  { key: "priorityScore", label: "Priority", width: "w-16" },
  { key: "dealName", label: "Deal Name", width: "w-auto" },
  { key: "amount", label: "Amount", width: "w-24" },
  { key: "stageName", label: "Stage", width: "w-28" },
  { key: "ownerName", label: "Owner", width: "w-28" },
  { key: "daysInStage", label: "Days", width: "w-16" },
  { key: "closeDate", label: "Close Date", width: "w-24" },
  { key: "flags", label: "Flags", width: "w-28" },
];

function getCloseDateStatus(
  closeDate: string | null
): "overdue" | "soon" | "normal" {
  if (!closeDate) return "normal";
  const now = new Date();
  const close = new Date(closeDate);
  const diffMs = close.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays <= 14) return "soon";
  return "normal";
}

function formatCloseDate(closeDate: string | null): string {
  if (!closeDate) return "--";
  return new Date(closeDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

const HEALTH_DOT: Record<Deal["health"], string> = {
  green: "text-[var(--accent-green)]",
  amber: "text-[var(--accent-orange)]",
  red: "text-[var(--accent-red)]",
};

const HEALTH_SYMBOL: Record<Deal["health"], string> = {
  green: "\u25CF",
  amber: "\u25CF",
  red: "\u25CF",
};

const FLAG_STYLES: Record<string, string> = {
  STALE:
    "bg-[var(--accent-orange-dim,rgba(245,158,11,0.1))] text-[var(--accent-orange)] border-[var(--accent-orange)]",
  OVERDUE:
    "bg-[var(--accent-red-dim,rgba(239,68,68,0.1))] text-[var(--accent-red)] border-[var(--accent-red)]",
};

export function DealDrilldownTable({
  deals,
  totalCount,
  totalValue,
  sort,
  order,
  onSortChange,
  onLoadMore,
  onClose,
  title,
}: DealDrilldownTableProps) {
  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function handleSort(columnKey: string) {
    if (sort === columnKey) {
      onSortChange(columnKey, order === "asc" ? "desc" : "asc");
    } else {
      onSortChange(columnKey, "desc");
    }
  }

  function getSortIndicator(columnKey: string): string {
    if (sort !== columnKey) return "";
    return order === "asc" ? " \u25B2" : " \u25BC";
  }

  const headerTitle =
    title ||
    `${totalCount} deal${totalCount !== 1 ? "s" : ""} -- ${formatDollars(totalValue)}`;

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          {headerTitle}
        </h3>
        <button
          onClick={onClose}
          className="font-mono text-xs px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
          aria-label="Close drill-down"
        >
          X
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-xs">
          <thead>
            <tr className="border-b border-[var(--border-color)]">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`text-left text-[var(--text-muted)] uppercase tracking-wider text-[10px] py-2 px-2 cursor-pointer select-none hover:text-[var(--text-secondary)] transition-colors ${col.width}`}
                >
                  {col.label}
                  {getSortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => {
              const closeDateStatus = getCloseDateStatus(deal.closeDate);
              const priorityBg =
                deal.priorityScore > 0
                  ? `rgba(59, 130, 246, ${Math.min(deal.priorityScore / 100, 1) * 0.2})`
                  : undefined;

              return (
                <tr
                  key={deal.id}
                  className="border-b border-[var(--border-color)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {/* Priority */}
                  <td
                    className="py-2 px-2 text-center"
                    style={priorityBg ? { backgroundColor: priorityBg } : undefined}
                  >
                    <span className="text-[var(--text-secondary)]">
                      {deal.priorityScore}
                    </span>
                  </td>

                  {/* Deal Name */}
                  <td className="py-2 px-2">
                    <a
                      href={`https://app.hubspot.com/contacts/3282655/record/0-3/${deal.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent-cyan)] hover:underline"
                    >
                      {deal.dealName}
                    </a>
                  </td>

                  {/* Amount */}
                  <td className="py-2 px-2 text-[var(--text-primary)]">
                    {formatDollars(deal.amount)}
                  </td>

                  {/* Stage */}
                  <td className="py-2 px-2 text-[var(--text-secondary)]">
                    {deal.stageName}
                  </td>

                  {/* Owner */}
                  <td className="py-2 px-2 text-[var(--text-secondary)]">
                    {deal.ownerName}
                  </td>

                  {/* Days in Stage with health dot */}
                  <td className="py-2 px-2">
                    <span className="flex items-center gap-1">
                      <span className={`text-[8px] ${HEALTH_DOT[deal.health]}`}>
                        {HEALTH_SYMBOL[deal.health]}
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {deal.daysInStage}
                      </span>
                    </span>
                  </td>

                  {/* Close Date */}
                  <td
                    className={`py-2 px-2 ${
                      closeDateStatus === "overdue"
                        ? "text-[var(--accent-red)]"
                        : closeDateStatus === "soon"
                          ? "text-[var(--accent-orange)]"
                          : "text-[var(--text-secondary)]"
                    }`}
                  >
                    {formatCloseDate(deal.closeDate)}
                  </td>

                  {/* Flags */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1 flex-wrap">
                      {deal.flags.map((flag) => (
                        <span
                          key={flag}
                          className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                            FLAG_STYLES[flag] ??
                            "bg-transparent text-[var(--text-muted)] border-[var(--border-color)]"
                          }`}
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {onLoadMore && deals.length < totalCount && (
        <div className="mt-3 flex justify-center">
          <button
            onClick={onLoadMore}
            className="font-mono text-[10px] px-3 py-1.5 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
          >
            Load more ({totalCount - deals.length} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
