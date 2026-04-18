"use client";

import { useState, useEffect, useCallback } from "react";
import { DealLink } from "@/components/DealLink";
import { TrendIcons } from "@/components/TrendIcons";
import type { HealthBucket } from "@/lib/health";

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
  healthBucket?: HealthBucket;
  regressionCount?: number;
  slipCount?: number;
  amountNet?: number;
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
  onClose?: () => void;
  title?: string;
  persistent?: boolean;
  onOpenDeal?: (id: string) => void;
}

function formatDollars(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

const COLUMNS = [
  { key: "priorityScore", label: "Pri", width: "w-12", hideOnMobile: false },
  { key: "dealName", label: "Deal", width: "min-w-[160px]", hideOnMobile: false },
  { key: "amount", label: "Amount", width: "w-20", hideOnMobile: false },
  { key: "stageName", label: "Stage", width: "w-24", hideOnMobile: false },
  { key: "ownerName", label: "Owner", width: "w-28", hideOnMobile: true },
  { key: "daysInStage", label: "Days", width: "w-14", hideOnMobile: false },
  { key: "closeDate", label: "Close", width: "w-20", hideOnMobile: true },
  { key: "nextStep", label: "Next Step", width: "min-w-[120px] max-w-[200px]", hideOnMobile: true },
  { key: "flags", label: "Flags", width: "w-20", hideOnMobile: true },
];

function getCloseDateStatus(closeDate: string | null): "overdue" | "soon" | "normal" {
  if (!closeDate) return "normal";
  const diffDays = (new Date(closeDate).getTime() - Date.now()) / 86400000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 14) return "soon";
  return "normal";
}

function formatCloseDate(closeDate: string | null): string {
  if (!closeDate) return "--";
  return new Date(closeDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const HEALTH_DOT: Record<Deal["health"], string> = {
  green: "text-[var(--accent-green)]",
  amber: "text-[var(--accent-orange)]",
  red: "text-[var(--accent-red)]",
};

const FLAG_STYLES: Record<string, string> = {
  stale: "bg-[var(--accent-orange-dim,rgba(245,158,11,0.1))] text-[var(--accent-orange)] border-[var(--accent-orange)]",
  overdue: "bg-[var(--accent-red-dim,rgba(239,68,68,0.1))] text-[var(--accent-red)] border-[var(--accent-red)]",
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
  persistent = false,
  onOpenDeal,
}: DealDrilldownTableProps) {
  // Close on Escape key (only when not persistent)
  useEffect(() => {
    if (persistent || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [persistent, onClose]);

  function handleSort(columnKey: string) {
    if (columnKey === "flags" || columnKey === "nextStep") return; // Not sortable
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

  const headerTitle = title || `${totalCount} deal${totalCount !== 1 ? "s" : ""} \u2014 ${formatDollars(totalValue)}`;

  return (
    <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            {persistent ? "Deal Pipeline" : headerTitle}
          </h3>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-blue-dim)] text-[var(--accent-blue)] border border-[var(--accent-blue)]">
            {totalCount}
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {formatDollars(totalValue)}
          </span>
        </div>
        {!persistent && onClose && (
          <button
            onClick={onClose}
            className="font-mono text-xs px-2 py-1 rounded border border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors cursor-pointer"
          >
            X
          </button>
        )}
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
                  className={`text-left text-[var(--text-muted)] uppercase tracking-wider text-[10px] py-2 px-2 cursor-pointer select-none hover:text-[var(--text-secondary)] transition-colors ${col.width} ${col.hideOnMobile ? "hidden lg:table-cell" : ""}`}
                >
                  {col.label}
                  {getSortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-8 text-center text-[var(--text-muted)] text-[10px]">
                  No deals match current filters
                </td>
              </tr>
            )}
            {deals.map((deal) => {
              const closeDateStatus = getCloseDateStatus(deal.closeDate);
              const priorityBg = deal.priorityScore > 0
                ? `rgba(59, 130, 246, ${Math.min(deal.priorityScore / 100, 1) * 0.15})`
                : undefined;

              return (
                <tr
                  key={deal.id}
                  className="border-b border-[var(--border-color)] hover:bg-[var(--bg-card-hover)] transition-colors"
                >
                  {/* Priority */}
                  <td className="py-1.5 px-2 text-center" style={priorityBg ? { backgroundColor: priorityBg } : undefined}>
                    <span className="text-[var(--text-secondary)] text-[10px]">{deal.priorityScore}</span>
                  </td>

                  {/* Deal Name + Trend Icons */}
                  <td className="py-1.5 px-2">
                    <div className="flex items-center gap-1.5">
                      <TrendIcons
                        bucket={deal.healthBucket}
                        amount={deal.amount}
                        momentumSignals={{
                          regression_count: deal.regressionCount,
                          slip_count: deal.slipCount,
                          amount_net: deal.amountNet,
                        }}
                      />
                      <DealLink
                        dealId={deal.id}
                        dealName={deal.dealName}
                        onOpenDeal={onOpenDeal}
                        className="text-[var(--text-secondary)] hover:text-[var(--accent-blue)] transition-colors block max-w-[200px]"
                        wrapperClassName="max-w-[220px]"
                      />
                    </div>
                  </td>

                  {/* Amount */}
                  <td className="py-1.5 px-2 text-[var(--text-primary)] font-semibold">
                    {formatDollars(deal.amount)}
                  </td>

                  {/* Stage */}
                  <td className="py-1.5 px-2">
                    <span className="text-[10px] px-1 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-muted)]">
                      {deal.stageName.replace(/^\d+\s*-\s*/, "")}
                    </span>
                  </td>

                  {/* Owner */}
                  <td className="py-1.5 px-2 text-[var(--text-muted)] hidden lg:table-cell">
                    {deal.ownerName}
                  </td>

                  {/* Days in Stage with health dot */}
                  <td className="py-1.5 px-2">
                    <span className="flex items-center gap-1">
                      <span className={`text-[8px] ${HEALTH_DOT[deal.health]}`}>&#x25CF;</span>
                      <span className="text-[var(--text-secondary)]">{deal.daysInStage}d</span>
                    </span>
                  </td>

                  {/* Close Date */}
                  <td className={`py-1.5 px-2 hidden lg:table-cell ${
                    closeDateStatus === "overdue" ? "text-[var(--accent-red)]"
                    : closeDateStatus === "soon" ? "text-[var(--accent-orange)]"
                    : "text-[var(--text-muted)]"
                  }`}>
                    {formatCloseDate(deal.closeDate)}
                  </td>

                  {/* Next Step */}
                  <td className="py-1.5 px-2 hidden lg:table-cell">
                    <span className={`text-[10px] truncate block max-w-[200px] ${deal.nextStep ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)] italic"}`}
                      title={deal.nextStep || "No next step set"}
                    >
                      {deal.nextStep || "—"}
                    </span>
                  </td>

                  {/* Flags */}
                  <td className="py-1.5 px-2 hidden lg:table-cell">
                    <div className="flex items-center gap-1">
                      {deal.flags.map((flag) => (
                        <span
                          key={flag}
                          className={`text-[9px] px-1 py-0.5 rounded border ${
                            FLAG_STYLES[flag] ?? "text-[var(--text-muted)] border-[var(--border-color)]"
                          }`}
                        >
                          {flag.toUpperCase()}
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
