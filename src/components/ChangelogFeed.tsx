"use client";

import { useMemo } from "react";

interface ChangelogEntry {
  dealId: string;
  dealName: string;
  pipeline: string;
  pipelineName: string;
  property: string;
  propertyLabel: string;
  oldValue: string;
  newValue: string;
  oldLabel: string;
  newLabel: string;
  timestamp: string;
  sourceType: string;
}

function getStageColor(label: string): string {
  if (label.includes("Closed Won") || label.includes("Renewed")) return "var(--accent-green)";
  if (label.includes("Closed Lost") || label.includes("Churn")) return "var(--accent-red)";
  if (label.includes("Negotiation") || label.includes("Proposal")) return "var(--accent-orange)";
  if (label.includes("Prospecting")) return "var(--accent-blue)";
  if (label.includes("Qualification") || label.includes("Solutioning")) return "var(--accent-purple)";
  return "var(--accent-cyan)";
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function ChangelogFeed({
  entries,
  filter,
}: {
  entries: ChangelogEntry[];
  filter: string;
}) {
  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    if (filter === "stage") return entries.filter((e) => e.property === "dealstage");
    if (filter === "amount") return entries.filter((e) => e.property === "amount");
    return entries;
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, ChangelogEntry[]> = {};
    for (const entry of filtered) {
      const dateKey = formatDate(entry.timestamp);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(entry);
    }
    return groups;
  }, [filtered]);

  if (filtered.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="font-mono text-xs text-[var(--text-muted)]">
          No changelog entries found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([date, dateEntries]) => (
        <div key={date}>
          {/* Date header */}
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider bg-[var(--bg-primary)] pr-3">
              {date}
            </span>
            <div className="flex-1 h-px bg-[var(--border-color)]" />
            <span className="font-mono text-xs text-[var(--text-muted)]">
              {dateEntries.length}
            </span>
          </div>

          <div className="space-y-0">
            {dateEntries.map((entry, i) => (
              <ChangelogRow key={`${entry.dealId}-${entry.property}-${entry.timestamp}-${i}`} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangelogRow({ entry }: { entry: ChangelogEntry }) {
  const isStageChange = entry.property === "dealstage";
  const isAmountChange = entry.property === "amount";

  const newColor = isStageChange
    ? getStageColor(entry.newLabel)
    : "var(--accent-cyan)";

  const amountDelta = isAmountChange
    ? parseFloat(entry.newValue || "0") - parseFloat(entry.oldValue || "0")
    : 0;

  return (
    <a
      href={`https://app.hubspot.com/contacts/3282655/record/0-3/${entry.dealId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="changelog-entry flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors font-mono text-xs group"
    >
      {/* Timestamp */}
      <span className="text-[var(--text-muted)] shrink-0 w-[52px] text-right">
        {formatTimestamp(entry.timestamp)}
      </span>

      {/* Pipeline tag */}
      <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-muted)] uppercase shrink-0">
        {entry.pipelineName}
      </span>

      {/* Change type tag */}
      <span
        className="text-[10px] px-1.5 py-0.5 rounded border uppercase font-bold shrink-0"
        style={{
          borderColor: `${newColor}44`,
          backgroundColor: `${newColor}15`,
          color: newColor,
        }}
      >
        {isStageChange ? "STAGE" : "AMOUNT"}
      </span>

      {/* Deal name */}
      <span className="text-[var(--text-secondary)] truncate shrink-1 min-w-0 group-hover:text-[var(--accent-blue)] transition-colors">
        {entry.dealName}
      </span>

      {/* Change values */}
      <span className="flex items-center gap-1.5 shrink-0 ml-auto">
        {isStageChange && (
          <>
            <span className="text-[var(--text-muted)]">{entry.oldLabel.replace(/^\d+\s*-\s*/, "")}</span>
            <span style={{ color: newColor }} className="font-bold">&rarr;</span>
            <span style={{ color: newColor }} className="font-semibold">{entry.newLabel.replace(/^\d+\s*-\s*/, "")}</span>
          </>
        )}
        {isAmountChange && (
          <>
            <span className="text-[var(--text-muted)]">{entry.oldLabel}</span>
            <span className={amountDelta >= 0 ? "amount-up" : "amount-down"}>&rarr;</span>
            <span className={`font-semibold ${amountDelta >= 0 ? "amount-up" : "amount-down"}`}>
              {entry.newLabel}
            </span>
            {amountDelta !== 0 && (
              <span
                className={`text-[10px] px-1 py-0.5 rounded ${
                  amountDelta >= 0
                    ? "bg-[var(--accent-green-dim)] text-[var(--accent-green)]"
                    : "bg-[var(--accent-red-dim)] text-[var(--accent-red)]"
                }`}
              >
                {amountDelta >= 0 ? "+" : ""}${Math.abs(amountDelta).toLocaleString()}
              </span>
            )}
          </>
        )}
      </span>
    </a>
  );
}
