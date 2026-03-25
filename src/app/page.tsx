"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { StatusBar, type SyncMeta } from "@/components/StatusBar";
import { StatsCards } from "@/components/StatsCards";
import { PipelineFunnel } from "@/components/PipelineFunnel";
import { ChangelogFeed } from "@/components/ChangelogFeed";
import { RecentDeals } from "@/components/RecentDeals";
import { NetMovementBar } from "@/components/NetMovementBar";
import { StaleDealsList } from "@/components/StaleDealsList";
import { MobileFilterDrawer } from "@/components/MobileFilterDrawer";
import { MobileStatsSummary } from "@/components/MobileStatsSummary";
import { MobileSidebarTabs } from "@/components/MobileSidebarTabs";
import { PipelineLedger } from "@/components/PipelineLedger";
import { LivelineCharts } from "@/components/LivelineCharts";

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

interface DealEntry {
  id: string;
  dealName: string;
  pipelineName: string;
  currentStageName: string;
  stageNumber: number;
  amount: number;
  lastModified: string;
  ownerName: string;
  changeType?: string;
  dealType?: string;
  stageEnteredAt?: string;
}

interface StageData {
  stageId: string;
  label: string;
  count: number;
  total_value: number;
}

interface PipelineInfo {
  pipeline: string;
  pipeline_name: string;
  deal_count: number;
}

interface NetMovement {
  created: { count: number; value: number };
  won: { count: number; value: number };
  lost: { count: number; value: number };
  net: number;
}

interface AmountMovement {
  grew: number;
  shrank: number;
  net: number;
}

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
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

function getQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  for (let year = currentYear; year >= currentYear - 1; year--) {
    for (let q = 4; q >= 1; q--) {
      options.push({
        value: `${year}-Q${q}`,
        label: `Q${q} ${year}`,
      });
    }
  }

  return options;
}

const DEAL_TYPE_OPTIONS = [
  { key: "all", label: "ALL" },
  { key: "upsell", label: "UPSELL" },
  { key: "newbusiness", label: "NEW BIZ" },
];

const FILTER_TABS = [
  { key: "all", label: "all" },
  { key: "stage", label: "stages" },
  { key: "amount", label: "amounts" },
  { key: "created", label: "created" },
  { key: "closedate", label: "close date" },
  { key: "owner", label: "owner" },
];

export default function Dashboard() {
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [recentDeals, setRecentDeals] = useState<DealEntry[]>([]);
  const [growthStages, setGrowthStages] = useState<StageData[]>([]);
  const [growthTotals, setGrowthTotals] = useState({ totalCount: 0, totalValue: 0 });
  const [renewalStages, setRenewalStages] = useState<StageData[]>([]);
  const [renewalTotals, setRenewalTotals] = useState({ totalCount: 0, totalValue: 0 });
  const [upsellStages, setUpsellStages] = useState<StageData[]>([]);
  const [upsellTotals, setUpsellTotals] = useState({ totalCount: 0, totalValue: 0 });
  const [upsellPipelines, setUpsellPipelines] = useState<{ pipeline: string; pipeline_name: string; count: number }[]>([]);
  const [upsellPipelineFilter, setUpsellPipelineFilter] = useState("4207989");
  const [pipelineValue, setPipelineValue] = useState({ totalValue: 0, count: 0, filteredValue: null as number | null, filteredCount: null as number | null });
  const [weightedPipeline, setWeightedPipeline] = useState(0);
  const [closedWon, setClosedWon] = useState({ totalValue: 0, count: 0 });
  const [closedLost, setClosedLost] = useState({ totalValue: 0, count: 0 });
  const [netMovement, setNetMovement] = useState<NetMovement | null>(null);
  const [amountMovement, setAmountMovement] = useState<AmountMovement | null>(null);
  const [staleDeals, setStaleDeals] = useState<StaleDeal[]>([]);
  const [staleTotalValue, setStaleTotalValue] = useState(0);
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [changesCount, setChangesCount] = useState({ todayChanges: 0, weekChanges: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const [filter, setFilter] = useState("all");
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([getCurrentQuarter()]);
  const [pipelineFilter, setPipelineFilter] = useState<string[]>([]);
  const [dealTypeFilter, setDealTypeFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [changelogView, setChangelogView] = useState<"changelog" | "ledger">("changelog");
  const [ledgerData, setLedgerData] = useState<{ currentBalance: number; quarterBalance: number | null; quarterLabel: string | null; transactions: { dealId: string; dealName: string; pipelineName: string; type: string; delta: number; description: string; timestamp: string; timestampShort: string; balance: number }[]; hiddenCount: number } | null>(null);
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  const [statsView, setStatsView] = useState<"cards" | "charts">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("revradar-stats-view") as "cards" | "charts") || "cards";
    }
    return "cards";
  });
  const [pipelineCreatedData, setPipelineCreatedData] = useState<{ daily: { day: string; value: number; count: number }[]; cumulative: { day: string; value: number }[]; total: number; dealCount: number } | null>(null);
  const [bookingsData, setBookingsData] = useState<{ daily: { day: string; value: number }[]; cumulative: { day: string; value: number }[]; total: number } | null>(null);
  const [netMovementTrend, setNetMovementTrend] = useState<{ candles: { day: string; time: number; open: number; high: number; low: number; close: number; net: number }[]; lineData: { time: number; value: number }[]; currentValue: number; startValue: number; netChange: number } | null>(null);

  const activeRequest = useRef(0);

  const toggleQuarter = (qtr: string) => {
    setSelectedQuarters(prev => {
      if (prev.includes(qtr)) {
        if (prev.length === 1) return prev;
        return prev.filter(q => q !== qtr);
      }
      return [...prev, qtr];
    });
  };

  const togglePipeline = (pipeline: string) => {
    setPipelineFilter(prev => {
      if (prev.includes(pipeline)) {
        return prev.filter(p => p !== pipeline);
      }
      return [...prev, pipeline];
    });
  };

  const fetchData = useCallback(async () => {
    const requestId = ++activeRequest.current;
    setIsLoading(true);
    setError(null);

    const isStale = () => requestId !== activeRequest.current;
    const qParam = selectedQuarters.length > 0 ? `&quarter=${selectedQuarters.join(",")}` : "";
    const pParam = pipelineFilter.length > 0 ? `&pipeline=${pipelineFilter.join(",")}` : "";
    const dtParam = dealTypeFilter !== "all" ? `&dealType=${dealTypeFilter}` : "";

    try {
      const [recentRes, growthRes, renewalRes, upsellRes, valueRes, weightedRes,
             closedWonRes, closedLostRes, netRes, amountRes, staleRes, pipelinesRes, changesCountRes] =
        await Promise.all([
          fetch(`/api/hubspot?type=recently-changed&limit=15${qParam}${pParam}${dtParam}`),
          fetch(`/api/hubspot?type=pipeline-stats&pipeline=4207989${qParam}`),
          fetch(`/api/hubspot?type=pipeline-stats&pipeline=4762460${qParam}`),
          fetch(`/api/hubspot?type=dealtype-stats&dealType=upsell&dtPipeline=${upsellPipelineFilter}${qParam}`),
          fetch(`/api/hubspot?type=pipeline-value${pParam}${dtParam}${qParam}`),
          fetch("/api/hubspot?type=weighted-pipeline"),
          fetch(`/api/hubspot?type=closed-won${qParam}`),
          fetch(`/api/hubspot?type=closed-lost${qParam}`),
          fetch(`/api/hubspot?type=net-movement${qParam}`),
          fetch(`/api/hubspot?type=amount-movement${qParam}`),
          fetch(`/api/hubspot?type=stale-deals${pParam}${dtParam}`),
          fetch("/api/hubspot?type=pipeline-list"),
          fetch("/api/hubspot?type=changes-count"),
        ]);

      if (isStale()) return;

      let anySuccess = false;

      if (recentRes.ok) {
        const d = await recentRes.json();
        if (!isStale()) { setRecentDeals(d.deals || []); anySuccess = true; }
      }
      if (growthRes.ok) {
        const d = await growthRes.json();
        if (!isStale()) {
          setGrowthStages(d.stats || []);
          setGrowthTotals({ totalCount: d.totalCount || 0, totalValue: d.totalValue || 0 });
          anySuccess = true;
        }
      }
      if (renewalRes.ok) {
        const d = await renewalRes.json();
        if (!isStale()) {
          setRenewalStages(d.stats || []);
          setRenewalTotals({ totalCount: d.totalCount || 0, totalValue: d.totalValue || 0 });
          anySuccess = true;
        }
      }
      if (upsellRes.ok) {
        const d = await upsellRes.json();
        if (!isStale()) {
          setUpsellStages(d.stats || []);
          setUpsellTotals({ totalCount: d.totalCount || 0, totalValue: d.totalValue || 0 });
          if (d.pipelines) setUpsellPipelines(d.pipelines);
        }
      }
      if (valueRes.ok) {
        const d = await valueRes.json();
        if (!isStale()) { setPipelineValue(d); anySuccess = true; }
      }
      if (weightedRes.ok) {
        const d = await weightedRes.json();
        if (!isStale()) { setWeightedPipeline(d.weightedValue || 0); }
      }
      if (closedWonRes.ok) {
        const d = await closedWonRes.json();
        if (!isStale()) { setClosedWon(d); anySuccess = true; }
      }
      if (closedLostRes.ok) {
        const d = await closedLostRes.json();
        if (!isStale()) { setClosedLost(d); }
      }
      if (netRes.ok) {
        const d = await netRes.json();
        if (!isStale()) { setNetMovement(d); }
      }
      if (amountRes.ok) {
        const d = await amountRes.json();
        if (!isStale()) { setAmountMovement(d); }
      }
      if (staleRes.ok) {
        const d = await staleRes.json();
        if (!isStale()) {
          setStaleDeals(d.deals || []);
          setStaleTotalValue(d.totalValue || 0);
        }
      }
      if (pipelinesRes.ok) {
        const d = await pipelinesRes.json();
        if (!isStale()) { setPipelines(d.pipelines || []); }
      }
      if (changesCountRes.ok) {
        const d = await changesCountRes.json();
        if (!isStale()) { setChangesCount({ todayChanges: d.todayChanges || 0, weekChanges: d.weekChanges || 0 }); }
      }

      if (!anySuccess && !isStale()) {
        setError("Failed to load data. Has the sync been run?");
        setIsLoading(false);
        return;
      }

      if (!isStale()) {
        setLastUpdated(
          new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        );
        setIsLoading(false);
      }

      // Fetch changelog, ledger, charts, and sync metadata separately
      const [changelogRes, syncMetaRes, ledgerRes, wowRes, bookingsRes, netTrendRes] = await Promise.all([
        fetch(`/api/hubspot?type=changelog&limit=200${qParam}${pParam}${dtParam}`),
        fetch("/api/hubspot?type=sync-status"),
        fetch(`/api/hubspot?type=pipeline-ledger${qParam}${pParam}${dtParam}`),
        fetch(`/api/hubspot?type=pipeline-created-wow${qParam}${pParam}${dtParam}`),
        fetch(`/api/hubspot?type=bookings-trend${qParam}${pParam}${dtParam}`),
        fetch(`/api/hubspot?type=net-movement-trend${qParam}${pParam}${dtParam}`),
      ]);
      if (changelogRes.ok && !isStale()) {
        const d = await changelogRes.json();
        if (!isStale()) setChangelog(d.changelogs || []);
      }
      if (ledgerRes.ok && !isStale()) {
        const d = await ledgerRes.json();
        if (!isStale()) setLedgerData(d);
      }
      if (wowRes.ok && !isStale()) {
        const d = await wowRes.json();
        if (!isStale()) setPipelineCreatedData(d);
      }
      if (bookingsRes.ok && !isStale()) {
        const d = await bookingsRes.json();
        if (!isStale()) setBookingsData(d);
      }
      if (netTrendRes.ok && !isStale()) {
        const d = await netTrendRes.json();
        if (!isStale()) setNetMovementTrend(d);
      }
      if (syncMetaRes.ok && !isStale()) {
        const d = await syncMetaRes.json();
        const meta = (d.meta || []) as { key: string; value: string }[];
        const incr = meta.find((m) => m.key === "last_incremental_sync");
        const full = meta.find((m) => m.key === "last_full_sync");
        if (!isStale()) {
          setSyncMeta({
            lastIncremental: incr?.value || null,
            lastFull: full?.value || null,
          });
        }
      }
    } catch {
      if (!isStale()) {
        setError("Failed to load data. Check database connection.");
        setIsLoading(false);
      }
    }
  }, [selectedQuarters, pipelineFilter, dealTypeFilter, upsellPipelineFilter]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => {
      activeRequest.current++;
      clearInterval(interval);
    };
  }, [fetchData]);

  // Use server-side changes count (Bug fix: client-side was limited by changelog fetch cap)
  const { todayChanges, weekChanges } = changesCount;

  const quarterLabel = selectedQuarters.length <= 2
    ? selectedQuarters.join(",")
    : `${selectedQuarters.length} qtrs`;

  const stats = {
    totalOpenDeals: pipelineValue.count,
    totalOpenValue: pipelineValue.totalValue,
    filteredOpenValue: pipelineValue.filteredValue,
    filteredOpenDeals: pipelineValue.filteredCount,
    weightedPipelineValue: weightedPipeline,
    todayChanges,
    weekChanges,
    closedWonThisMonth: closedWon.count,
    closedWonValue: closedWon.totalValue,
    closedLostThisMonth: closedLost.count,
    closedLostValue: closedLost.totalValue,
    quarterLabel,
  };

  const totalDeals = pipelines.reduce((s, p) => s + p.deal_count, 0);

  return (
    <div className="flex flex-col min-h-screen">
      <StatusBar
        lastUpdated={lastUpdated}
        isLoading={isLoading}
        onRefresh={() => fetchData()}
        syncMeta={syncMeta}
      />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Mobile: compact stats + filter trigger */}
        <MobileStatsSummary stats={stats} />
        <div className="sm:hidden flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            {quarterLabel} · {pipelineFilter.length === 0 ? "All Pipelines" : pipelineFilter.map(id => pipelines.find(p => p.pipeline === id)?.pipeline_name || id).join(", ")}
            {dealTypeFilter !== "all" ? ` · ${dealTypeFilter}` : ""}
          </span>
          <button
            onClick={() => setFilterDrawerOpen(true)}
            className="font-mono text-[11px] px-3 py-1.5 rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="20" y2="12" />
              <line x1="12" y1="18" x2="20" y2="18" />
            </svg>
            filters
          </button>
        </div>

        {/* Desktop: Filters bar */}
        <div className="hidden sm:flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Quarter multi-select */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase mr-1">QTR</span>
              {getQuarterOptions().map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => toggleQuarter(opt.value)}
                  className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                    selectedQuarters.includes(opt.value)
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                      : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Deal type filter */}
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] text-[var(--text-muted)] uppercase mr-1">TYPE</span>
              {DEAL_TYPE_OPTIONS.map((dt) => (
                <button
                  key={dt.key}
                  onClick={() => setDealTypeFilter(dt.key)}
                  className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                    dealTypeFilter === dt.key
                      ? "border-[var(--accent-orange)] bg-[var(--accent-orange-dim)] text-[var(--accent-orange)]"
                      : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {dt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline filter + counts */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPipelineFilter([])}
                className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                  pipelineFilter.length === 0
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                    : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                ALL
              </button>
              {pipelines.slice(0, 5).map((p) => (
                <button
                  key={p.pipeline}
                  onClick={() => togglePipeline(p.pipeline)}
                  className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                    pipelineFilter.includes(p.pipeline)
                      ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                      : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  {p.pipeline_name}
                </button>
              ))}
            </div>
            <div className="h-4 w-px bg-[var(--border-color)]" />
            {pipelines.slice(0, 5).map((p) => (
              <span
                key={p.pipeline}
                className="font-mono text-[10px] text-[var(--text-muted)]"
              >
                {p.pipeline_name}:{" "}
                <span className="text-[var(--text-secondary)]">{p.deal_count}</span>
              </span>
            ))}
            {totalDeals > 0 && (
              <span className="font-mono text-[10px] text-[var(--accent-blue)]">
                total: {totalDeals}
              </span>
            )}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-[var(--accent-red)] bg-[var(--accent-red-dim)] p-4">
            <p className="font-mono text-sm text-[var(--accent-red)]">
              {error}
            </p>
          </div>
        )}

        {/* Stats / Charts row with flip toggle (hidden on mobile — MobileStatsSummary shown above) */}
        <div className="hidden sm:block">
          {/* Metrics / Trends toggle */}
          <div className="flex items-center gap-1 mb-3">
            {(["cards", "charts"] as const).map((view) => (
              <button
                key={view}
                onClick={() => { setStatsView(view); localStorage.setItem("revradar-stats-view", view); }}
                className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                  statsView === view
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                    : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {view === "cards" ? "metrics" : "trends"}
              </button>
            ))}
          </div>

          {statsView === "cards" ? (
            <StatsCards stats={stats} />
          ) : (
            <LivelineCharts
              pipelineCreatedData={pipelineCreatedData}
              bookingsData={bookingsData}
              netMovementData={netMovementTrend}
              theme={typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") || "terminal" : "terminal"}
            />
          )}
        </div>

        {/* Net movement bar (hidden on mobile) */}
        <div className="hidden sm:block">
          <NetMovementBar movement={netMovement} amountMovement={amountMovement} />
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Changelog - main column */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3 sm:p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 relative">
                  <span className="font-mono text-xs text-[var(--accent-orange)]">
                    &gt;
                  </span>
                  <button
                    onClick={() => setViewDropdownOpen(!viewDropdownOpen)}
                    className="flex items-center gap-1.5 cursor-pointer group"
                  >
                    <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider group-hover:text-[var(--accent-blue)] transition-colors">
                      {changelogView === "changelog" ? "Changelog" : "Pipeline Ledger"}
                    </h2>
                    <svg className={`w-3 h-3 text-[var(--text-muted)] transition-transform duration-200 ${viewDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {changelogView === "changelog" && changelog.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {changelog.length}
                    </span>
                  )}
                  {changelogView === "ledger" && ledgerData && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {ledgerData.transactions.length}
                    </span>
                  )}

                  {/* View dropdown */}
                  {viewDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg overflow-hidden min-w-[180px]">
                      <button
                        onClick={() => { setChangelogView("changelog"); setViewDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 font-mono text-xs transition-colors cursor-pointer ${
                          changelogView === "changelog"
                            ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                        }`}
                      >
                        Changelog
                        <span className="block text-[10px] text-[var(--text-muted)]">All deal changes</span>
                      </button>
                      <button
                        onClick={() => { setChangelogView("ledger"); setViewDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 font-mono text-xs transition-colors cursor-pointer ${
                          changelogView === "ledger"
                            ? "bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"
                        }`}
                      >
                        Pipeline Ledger
                        <span className="block text-[10px] text-[var(--text-muted)]">Running balance view</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Filter tabs (desktop only — on mobile, filters are in the drawer) */}
                {changelogView === "changelog" && (
                  <div className="hidden sm:flex items-center gap-1">
                    {FILTER_TABS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                          filter === f.key
                            ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                            : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {changelogView === "changelog" ? (
                isLoading && changelog.length === 0 ? (
                  <div className="space-y-3 py-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--bg-secondary)] animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-[var(--bg-secondary)] rounded animate-pulse w-3/4" />
                          <div className="h-2 bg-[var(--bg-secondary)] rounded animate-pulse w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ChangelogFeed entries={changelog} filter={filter} />
                )
              ) : (
                ledgerData ? (
                  <PipelineLedger currentBalance={ledgerData.currentBalance} quarterBalance={ledgerData.quarterBalance} quarterLabel={ledgerData.quarterLabel} transactions={ledgerData.transactions} hiddenCount={ledgerData.hiddenCount} />
                ) : (
                  <div className="space-y-3 py-4">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-[var(--bg-secondary)] animate-pulse" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-[var(--bg-secondary)] rounded animate-pulse w-3/4" />
                          <div className="h-2 bg-[var(--bg-secondary)] rounded animate-pulse w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>

          {/* Mobile sidebar tabs (below changelog on small screens) */}
          <div className="lg:hidden">
            <MobileSidebarTabs
              tabs={[
                {
                  key: "funnels",
                  label: "Funnels",
                  content: (
                    <div className="space-y-4">
                      <PipelineFunnel stages={growthStages} title="Growth Pipeline" totalCount={growthTotals.totalCount} totalValue={growthTotals.totalValue} />
                      {renewalStages.length > 0 && <PipelineFunnel stages={renewalStages} title="Renewal Pipeline" totalCount={renewalTotals.totalCount} totalValue={renewalTotals.totalValue} />}
                      {upsellStages.length > 0 && <PipelineFunnel stages={upsellStages} title="Upsell" totalCount={upsellTotals.totalCount} totalValue={upsellTotals.totalValue} accentColor="var(--accent-orange)" filterOptions={[{ key: "all", label: "ALL" }, ...upsellPipelines.map(p => ({ key: p.pipeline, label: p.pipeline_name }))]} activeFilter={upsellPipelineFilter} onFilterChange={setUpsellPipelineFilter} />}
                    </div>
                  ),
                },
                {
                  key: "stale",
                  label: "Stale",
                  content: <StaleDealsList deals={staleDeals} totalValue={staleTotalValue} />,
                },
                {
                  key: "recent",
                  label: "Recent",
                  content: <RecentDeals deals={recentDeals} />,
                },
              ]}
            />
          </div>

          {/* Desktop sidebar */}
          <div className="hidden lg:block lg:col-span-5 xl:col-span-4 space-y-6">
            <PipelineFunnel
              stages={growthStages}
              title="Growth Pipeline"
              totalCount={growthTotals.totalCount}
              totalValue={growthTotals.totalValue}
            />
            {renewalStages.length > 0 && (
              <PipelineFunnel
                stages={renewalStages}
                title="Renewal Pipeline"
                totalCount={renewalTotals.totalCount}
                totalValue={renewalTotals.totalValue}
              />
            )}
            {upsellStages.length > 0 && (
              <PipelineFunnel
                stages={upsellStages}
                title="Upsell"
                totalCount={upsellTotals.totalCount}
                totalValue={upsellTotals.totalValue}
                accentColor="var(--accent-orange)"
                filterOptions={[
                  { key: "all", label: "ALL" },
                  ...upsellPipelines.map(p => ({ key: p.pipeline, label: p.pipeline_name })),
                ]}
                activeFilter={upsellPipelineFilter}
                onFilterChange={setUpsellPipelineFilter}
              />
            )}

            {/* Stale deals warning */}
            <StaleDealsList deals={staleDeals} totalValue={staleTotalValue} />

            <RecentDeals deals={recentDeals} />
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-[var(--border-color)] pt-4 pb-8">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              CEO Dashboard v2.0 &middot; HubSpot Pipeline Intelligence &middot;{" "}
              <Link href="/updates" className="text-[var(--accent-blue)] hover:underline">
                updates &amp; dev notes
              </Link>
            </span>
            <span className="font-mono text-[10px] text-[var(--text-muted)] hidden sm:inline">
              auto-refresh: 2min &middot; hub:{" "}
              <span className="text-[var(--accent-blue)]">3282655</span>
            </span>
          </div>
        </footer>
      </main>

      {/* Mobile filter drawer (rendered outside main for fixed positioning) */}
      <MobileFilterDrawer
        isOpen={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        quarterOptions={getQuarterOptions()}
        selectedQuarters={selectedQuarters}
        onToggleQuarter={toggleQuarter}
        dealTypeFilter={dealTypeFilter}
        onDealTypeChange={setDealTypeFilter}
        pipelines={pipelines}
        pipelineFilter={pipelineFilter}
        onPipelineToggle={togglePipeline}
        onPipelineClear={() => setPipelineFilter([])}
        filter={filter}
        onFilterChange={setFilter}
        changelogView={changelogView}
      />
    </div>
  );
}
