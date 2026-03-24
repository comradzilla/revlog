"use client";

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  // Quarter
  quarterOptions: { value: string; label: string }[];
  selectedQuarters: string[];
  onToggleQuarter: (qtr: string) => void;
  // Deal type
  dealTypeFilter: string;
  onDealTypeChange: (dt: string) => void;
  // Pipeline
  pipelines: { pipeline: string; pipeline_name: string; deal_count: number }[];
  pipelineFilter: string[];
  onPipelineToggle: (p: string) => void;
  onPipelineClear: () => void;
  // Changelog filter
  filter: string;
  onFilterChange: (f: string) => void;
  // View mode
  changelogView?: "changelog" | "ledger";
}

const DEAL_TYPES = [
  { key: "all", label: "ALL" },
  { key: "upsell", label: "UPSELL" },
  { key: "newbusiness", label: "NEW BIZ" },
];

const CHANGE_FILTERS = [
  { key: "all", label: "all" },
  { key: "stage", label: "stages" },
  { key: "amount", label: "amounts" },
  { key: "created", label: "created" },
  { key: "closedate", label: "close date" },
  { key: "owner", label: "owner" },
];

export function MobileFilterDrawer({
  isOpen,
  onClose,
  quarterOptions,
  selectedQuarters,
  onToggleQuarter,
  dealTypeFilter,
  onDealTypeChange,
  pipelines,
  pipelineFilter,
  onPipelineToggle,
  onPipelineClear,
  filter,
  onFilterChange,
  changelogView = "changelog",
}: FilterDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] sm:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute bottom-0 left-0 right-0 filter-drawer-enter bg-[var(--bg-card)] border-t border-[var(--border-color)] rounded-t-xl max-h-[75vh] overflow-y-auto">
        {/* Handle */}
        <div className="sticky top-0 bg-[var(--bg-card)] pt-3 pb-2 px-4 border-b border-[var(--border-color)]">
          <div className="w-8 h-1 rounded-full bg-[var(--border-color)] mx-auto mb-2" />
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[var(--text-primary)] uppercase tracking-wider">Filters</span>
            <button
              onClick={onClose}
              className="font-mono text-xs px-3 py-1 rounded border border-[var(--accent-blue)] text-[var(--accent-blue)] cursor-pointer"
            >
              done
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5">
          {/* Quarter */}
          <div>
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase block mb-2">Quarter</span>
            <div className="flex flex-wrap gap-1.5">
              {quarterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onToggleQuarter(opt.value)}
                  className={`font-mono text-[11px] px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                    selectedQuarters.includes(opt.value)
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                      : "border-[var(--border-color)] text-[var(--text-muted)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Deal Type */}
          <div>
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase block mb-2">Deal Type</span>
            <div className="flex gap-1.5">
              {DEAL_TYPES.map((dt) => (
                <button
                  key={dt.key}
                  onClick={() => onDealTypeChange(dt.key)}
                  className={`font-mono text-[11px] px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                    dealTypeFilter === dt.key
                      ? "border-[var(--accent-orange)] bg-[var(--accent-orange-dim)] text-[var(--accent-orange)]"
                      : "border-[var(--border-color)] text-[var(--text-muted)]"
                  }`}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase block mb-2">Pipeline</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={onPipelineClear}
                className={`font-mono text-[11px] px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                  pipelineFilter.length === 0
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                    : "border-[var(--border-color)] text-[var(--text-muted)]"
                }`}
              >
                ALL
              </button>
              {pipelines.slice(0, 5).map((p) => (
                <button
                  key={p.pipeline}
                  onClick={() => onPipelineToggle(p.pipeline)}
                  className={`font-mono text-[11px] px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                    pipelineFilter.includes(p.pipeline)
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                      : "border-[var(--border-color)] text-[var(--text-muted)]"
                  }`}
                >
                  {p.pipeline_name}
                </button>
              ))}
            </div>
          </div>

          {/* Changelog type — only shown in changelog view */}
          {changelogView === "changelog" && (
            <div>
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase block mb-2">Change Type</span>
              <div className="flex flex-wrap gap-1.5">
                {CHANGE_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => onFilterChange(f.key)}
                    className={`font-mono text-[11px] px-2.5 py-1.5 rounded border transition-colors cursor-pointer ${
                      filter === f.key
                        ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                        : "border-[var(--border-color)] text-[var(--text-muted)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
