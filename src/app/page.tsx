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
  lastActivity: string | null;
  daysStale: number;
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
  const [pipelineValue, setPipelineValue] = useState({ totalValue: 0, count: 0 });
  const [weightedPipeline, setWeightedPipeline] = useState(0);
  const [closedWon, setClosedWon] = useState({ totalValue: 0, count: 0 });
  const [closedLost, setClosedLost] = useState({ totalValue: 0, count: 0 });
  const [netMovement, setNetMovement] = useState<NetMovement | null>(null);
  const [amountMovement, setAmountMovement] = useState<AmountMovement | null>(null);
  const [staleDeals, setStaleDeals] = useState<StaleDeal[]>([]);
  const [staleTotalValue, setStaleTotalValue] = useState(0);
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const [filter, setFilter] = useState("all");
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([getCurrentQuarter()]);
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [dealTypeFilter, setDealTypeFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

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

  const fetchData = useCallback(async () => {
    const requestId = ++activeRequest.current;
    setIsLoading(true);
    setError(null);

    const isStale = () => requestId !== activeRequest.current;
    const qParam = selectedQuarters.length > 0 ? `&quarter=${selectedQuarters.join(",")}` : "";
    const pParam = pipelineFilter !== "all" ? `&pipeline=${pipelineFilter}` : "";
    const dtParam = dealTypeFilter !== "all" ? `&dealType=${dealTypeFilter}` : "";

    try {
      const [recentRes, growthRes, renewalRes, upsellRes, valueRes, weightedRes,
             closedWonRes, closedLostRes, netRes, amountRes, staleRes, pipelinesRes] =
        await Promise.all([
          fetch(`/api/hubspot?type=recently-changed&limit=15${qParam}${pParam}${dtParam}`),
          fetch("/api/hubspot?type=pipeline-stats&pipeline=4207989"),
          fetch("/api/hubspot?type=pipeline-stats&pipeline=4762460"),
          fetch(`/api/hubspot?type=dealtype-stats&dealType=upsell&dtPipeline=${upsellPipelineFilter}`),
          fetch("/api/hubspot?type=pipeline-value"),
          fetch("/api/hubspot?type=weighted-pipeline"),
          fetch(`/api/hubspot?type=closed-won${qParam}`),
          fetch(`/api/hubspot?type=closed-lost${qParam}`),
          fetch(`/api/hubspot?type=net-movement${qParam}`),
          fetch(`/api/hubspot?type=amount-movement${qParam}`),
          fetch("/api/hubspot?type=stale-deals"),
          fetch("/api/hubspot?type=pipeline-list"),
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

      // Fetch changelog and sync metadata separately
      const [changelogRes, syncMetaRes] = await Promise.all([
        fetch(`/api/hubspot?type=changelog&limit=200${qParam}${pParam}${dtParam}`),
        fetch("/api/hubspot?type=sync-status"),
      ]);
      if (changelogRes.ok && !isStale()) {
        const d = await changelogRes.json();
        if (!isStale()) setChangelog(d.changelogs || []);
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

  // Compute stats from changelog
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000);

  const todayChanges = changelog.filter(
    (c) => new Date(c.timestamp) >= todayStart
  ).length;
  const weekChanges = changelog.filter(
    (c) => new Date(c.timestamp) >= weekStart
  ).length;

  const quarterLabel = selectedQuarters.length <= 2
    ? selectedQuarters.join(",")
    : `${selectedQuarters.length} qtrs`;

  const stats = {
    totalOpenDeals: pipelineValue.count,
    totalOpenValue: pipelineValue.totalValue,
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

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-6 py-6 space-y-6">
        {/* Filters bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
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
                onClick={() => setPipelineFilter("all")}
                className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                  pipelineFilter === "all"
                    ? "border-[var(--accent-blue)] bg-[var(--accent-blue-dim)] text-[var(--accent-blue)]"
                    : "border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}
              >
                ALL
              </button>
              {pipelines.slice(0, 5).map((p) => (
                <button
                  key={p.pipeline}
                  onClick={() => setPipelineFilter(p.pipeline)}
                  className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors cursor-pointer ${
                    pipelineFilter === p.pipeline
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

        {/* Stats row */}
        <StatsCards stats={stats} />

        {/* Net movement bar */}
        <NetMovementBar movement={netMovement} amountMovement={amountMovement} />

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Changelog - main column */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="card-glow rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--accent-orange)]">
                    &gt;
                  </span>
                  <h2 className="font-mono text-sm font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Changelog
                  </h2>
                  {changelog.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-color)]">
                      {changelog.length}
                    </span>
                  )}
                </div>

                {/* Filter tabs */}
                <div className="flex items-center gap-1">
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
              </div>

              {isLoading && changelog.length === 0 ? (
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
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
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
            <span className="font-mono text-[10px] text-[var(--text-muted)]">
              auto-refresh: 2min &middot; hub:{" "}
              <span className="text-[var(--accent-blue)]">3282655</span>
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}
