"use client";

import { useState, useRef, useEffect, useMemo } from "react";

interface AnalyticsFiltersProps {
  quarters: string[];
  setQuarters: (q: string[]) => void;
  pipelines: { pipeline: string; pipeline_name: string; deal_count: number }[];
  pipelineFilter: string[];
  setPipelineFilter: (p: string[]) => void;
  dealTypeFilter: string;
  setDealTypeFilter: (d: string) => void;
  owners: { id: string; name: string; dealCount: number; totalValue: number }[];
  ownerFilter: string[];
  setOwnerFilter: (o: string[]) => void;
  granularity: string;
  setGranularity: (g: string) => void;
  comparisonEnabled: boolean;
  setComparisonEnabled: (c: boolean) => void;
}

const DEAL_TYPES = [
  { key: "all", label: "ALL" },
  { key: "upsell", label: "UPSELL" },
  { key: "newbusiness", label: "NEW BIZ" },
];

const GRANULARITIES = ["Day", "Week", "Month"];

function generateQuarterOptions(): { value: string; label: string }[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const prevYear = currentYear - 1;
  const options: { value: string; label: string }[] = [];

  for (let q = 1; q <= 4; q++) {
    options.push({ value: `${currentYear}-Q${q}`, label: `Q${q} ${currentYear}` });
  }
  for (let q = 1; q <= 4; q++) {
    options.push({ value: `${prevYear}-Q${q}`, label: `Q${q} ${prevYear}` });
  }

  return options;
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

const btnBase =
  "font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer";
const btnActive =
  "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]";
const btnInactive =
  "border-[var(--border-color)] bg-transparent text-[var(--text-muted)]";

export function AnalyticsFilters({
  quarters,
  setQuarters,
  pipelines,
  pipelineFilter,
  setPipelineFilter,
  dealTypeFilter,
  setDealTypeFilter,
  owners,
  ownerFilter,
  setOwnerFilter,
  granularity,
  setGranularity,
  comparisonEnabled,
  setComparisonEnabled,
}: AnalyticsFiltersProps) {
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const quarterOptions = useMemo(() => generateQuarterOptions(), []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOwnerDropdownOpen(false);
      }
    }
    if (ownerDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [ownerDropdownOpen]);

  function toggleQuarter(q: string) {
    if (quarters.includes(q)) {
      setQuarters(quarters.filter((x) => x !== q));
    } else {
      setQuarters([...quarters, q]);
    }
  }

  function togglePipeline(p: string) {
    if (pipelineFilter.includes(p)) {
      setPipelineFilter(pipelineFilter.filter((x) => x !== p));
    } else {
      setPipelineFilter([...pipelineFilter, p]);
    }
  }

  function toggleOwner(id: string) {
    if (ownerFilter.includes(id)) {
      setOwnerFilter(ownerFilter.filter((x) => x !== id));
    } else {
      setOwnerFilter([...ownerFilter, id]);
    }
  }

  const filteredOwners = useMemo(() => {
    if (!ownerSearch.trim()) return owners;
    const q = ownerSearch.toLowerCase();
    return owners.filter((o) => o.name.toLowerCase().includes(q));
  }, [owners, ownerSearch]);

  const ownerLabel = useMemo(() => {
    if (ownerFilter.length === 0) return "Rep: All";
    if (ownerFilter.length === 1) {
      const match = owners.find((o) => o.id === ownerFilter[0]);
      return `Rep: ${match?.name ?? ownerFilter[0]}`;
    }
    return `Rep: ${ownerFilter.length} selected`;
  }, [ownerFilter, owners]);

  const divider = (
    <div className="h-4 w-px bg-[var(--border-color)] mx-1 flex-shrink-0" />
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-2">
      {/* Quarters */}
      {quarterOptions.map((opt) => (
        <button
          key={opt.value}
          onClick={() => toggleQuarter(opt.value)}
          className={`${btnBase} ${
            quarters.includes(opt.value) ? btnActive : btnInactive
          }`}
        >
          {opt.label}
        </button>
      ))}

      {divider}

      {/* Pipeline */}
      <button
        onClick={() => setPipelineFilter([])}
        className={`${btnBase} ${
          pipelineFilter.length === 0 ? btnActive : btnInactive
        }`}
      >
        ALL
      </button>
      {pipelines.map((p) => (
        <button
          key={p.pipeline}
          onClick={() => togglePipeline(p.pipeline)}
          className={`${btnBase} ${
            pipelineFilter.includes(p.pipeline) ? btnActive : btnInactive
          }`}
        >
          {p.pipeline_name}
        </button>
      ))}

      {divider}

      {/* Deal type */}
      {DEAL_TYPES.map((dt) => (
        <button
          key={dt.key}
          onClick={() => setDealTypeFilter(dt.key)}
          className={`${btnBase} ${
            dealTypeFilter === dt.key ? btnActive : btnInactive
          }`}
        >
          {dt.label}
        </button>
      ))}

      {divider}

      {/* Owner dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOwnerDropdownOpen(!ownerDropdownOpen)}
          className={`${btnBase} ${
            ownerFilter.length > 0 ? btnActive : btnInactive
          }`}
        >
          {ownerLabel}
        </button>

        {ownerDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-64 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-lg overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-[var(--border-color)]">
              <input
                type="text"
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                placeholder="Search reps..."
                className="w-full font-mono text-[10px] px-2 py-1 rounded border border-[var(--border-color)] bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]"
                autoFocus
              />
            </div>

            {/* Owner list */}
            <div className="max-h-48 overflow-y-auto">
              {ownerFilter.length > 0 && (
                <button
                  onClick={() => {
                    setOwnerFilter([]);
                    setOwnerDropdownOpen(false);
                  }}
                  className="w-full text-left font-mono text-[10px] px-3 py-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-card-hover)] transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              )}
              {filteredOwners.map((o) => (
                <button
                  key={o.id}
                  onClick={() => toggleOwner(o.id)}
                  className={`w-full text-left font-mono text-[10px] px-3 py-1.5 transition-colors cursor-pointer flex items-center justify-between ${
                    ownerFilter.includes(o.id)
                      ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                  }`}
                >
                  <span>{o.name}</span>
                  <span className="text-[var(--text-muted)]">
                    {o.dealCount} deals, {formatDollars(o.totalValue)}
                  </span>
                </button>
              ))}
              {filteredOwners.length === 0 && (
                <div className="font-mono text-[10px] text-[var(--text-muted)] px-3 py-2">
                  No reps found
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {divider}

      {/* Granularity */}
      {GRANULARITIES.map((g) => (
        <button
          key={g}
          onClick={() => setGranularity(g.toLowerCase())}
          className={`${btnBase} ${
            granularity === g.toLowerCase() ? btnActive : btnInactive
          }`}
        >
          {g}
        </button>
      ))}

      {divider}

      {/* Comparison toggle */}
      <button
        onClick={() => setComparisonEnabled(!comparisonEnabled)}
        className={`${btnBase} ${
          comparisonEnabled ? btnActive : btnInactive
        }`}
      >
        vs prev
      </button>
    </div>
  );
}
