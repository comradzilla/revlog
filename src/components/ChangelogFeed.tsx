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
  ownerName?: string;
  isRegression?: boolean;
}

function getStageColor(label: string): string {
  if (!label) return "var(--accent-cyan)";
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

// Property type tag config
const PROPERTY_CONFIG: Record<string, { label: string; color: string }> = {
  dealstage: { label: "STAGE", color: "var(--accent-orange)" },
  amount: { label: "AMOUNT", color: "var(--accent-cyan)" },
  created: { label: "CREATED", color: "var(--accent-green)" },
  closedate: { label: "CLOSE DATE", color: "var(--accent-blue)" },
  hubspot_owner_id: { label: "OWNER", color: "var(--accent-purple)" },
};

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
    if (filter === "created") return entries.filter((e) => e.property === "created");
    if (filter === "closedate") return entries.filter((e) => e.property === "closedate");
    if (filter === "owner") return entries.filter((e) => e.property === "hubspot_owner_id");
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
  const isCreation = entry.property === "created";
  const isCloseDate = entry.property === "closedate";
  const isOwnerChange = entry.property === "hubspot_owner_id";

  const config = PROPERTY_CONFIG[entry.property] || { label: entry.property.toUpperCase(), color: "var(--text-muted)" };

  const amountDelta = isAmountChange
    ? parseFloat(entry.newValue || "0") - parseFloat(entry.oldValue || "0")
    : 0;

  // Detect close date slip (new date is later than old date)
  const isDateSlip = isCloseDate && entry.oldValue && entry.newValue
    ? new Date(entry.newValue).getTime() > new Date(entry.oldValue).getTime()
    : false;

  const rowBorderClass = entry.isRegression
    ? "border-l-2 border-l-[var(--accent-red)]"
    : isCreation
    ? "border-l-2 border-l-[var(--accent-green)]"
    : isDateSlip
    ? "border-l-2 border-l-[var(--accent-orange)]"
    : "";

  return (
    <a
      href={`https://app.hubspot.com/contacts/3282655/record/0-3/${entry.dealId}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`changelog-entry flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 py-1.5 px-2 rounded hover:bg-[var(--bg-card-hover)] transition-colors font-mono text-xs group ${rowBorderClass}`}
    >
      {/* Line 1 (mobile: time + deal name) / Desktop: inline */}
      <div className="flex items-center gap-2 sm:contents">
        {/* Timestamp */}
        <span className="text-[var(--text-muted)] shrink-0 w-[52px] text-right">
          {formatTimestamp(entry.timestamp)}
        </span>

        {/* Deal name (mobile: shows on line 1) */}
        <span className="text-[var(--text-secondary)] truncate shrink-1 min-w-0 group-hover:text-[var(--accent-blue)] transition-colors sm:hidden">
          {entry.dealName}
        </span>
      </div>

      {/* Line 2 (mobile: tags + change) / Desktop: inline */}
      <div className="flex items-center gap-1 sm:gap-1.5 sm:contents pl-[56px] sm:pl-0 overflow-hidden min-w-0">
        {/* Pipeline tag */}
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-muted)] uppercase shrink-0">
          {entry.pipelineName}
        </span>

        {/* Change type tag */}
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

        {/* Regression indicator */}
        {entry.isRegression && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--accent-red-dim)] text-[var(--accent-red)] font-bold shrink-0">
            ⚠ REGR
          </span>
        )}

        {/* Close date slip indicator */}
        {isDateSlip && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-[var(--accent-orange-dim)] text-[var(--accent-orange)] font-bold shrink-0">
            SLIP
          </span>
        )}

        {/* Deal name (desktop only — on mobile it's on line 1) */}
        <span className="text-[var(--text-secondary)] truncate shrink-1 min-w-0 group-hover:text-[var(--accent-blue)] transition-colors hidden sm:inline">
          {entry.dealName}
        </span>

        {/* Owner name */}
        {entry.ownerName && entry.ownerName !== "Unassigned" && !isOwnerChange && (
          <span className="text-[10px] text-[var(--text-muted)] shrink-0 hidden xl:inline">
            {entry.ownerName}
          </span>
        )}

        {/* Change values */}
        <span className="flex items-center gap-1 sm:gap-1.5 min-w-0 sm:shrink-0 sm:ml-auto whitespace-nowrap">
        {isStageChange && (
          <>
            <span className="text-[var(--text-muted)]">{entry.oldLabel.replace(/^\d+\s*-\s*/, "")}</span>
            <span style={{ color: getStageColor(entry.newLabel) }} className="font-bold">&rarr;</span>
            <span style={{ color: getStageColor(entry.newLabel) }} className="font-semibold">{entry.newLabel.replace(/^\d+\s*-\s*/, "")}</span>
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
        {isCreation && (
          <span className="text-[var(--accent-green)]">
            {entry.newLabel}
          </span>
        )}
        {isCloseDate && (
          <>
            <span className="text-[var(--text-muted)]">{entry.oldLabel}</span>
            <span className={isDateSlip ? "text-[var(--accent-orange)]" : "text-[var(--accent-blue)]"} >&rarr;</span>
            <span className={`font-semibold ${isDateSlip ? "text-[var(--accent-orange)]" : "text-[var(--accent-blue)]"}`}>
              {entry.newLabel}
            </span>
          </>
        )}
        {isOwnerChange && (
          <>
            <span className="text-[var(--text-muted)]">{entry.oldLabel}</span>
            <span className="text-[var(--accent-purple)]">&rarr;</span>
            <span className="font-semibold text-[var(--accent-purple)]">{entry.newLabel}</span>
          </>
        )}
      </span>
      </div>
    </a>
  );
}
