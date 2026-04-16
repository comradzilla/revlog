"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { StatusBar, type SyncMeta } from "@/components/StatusBar";
import { AnalyticsFilters } from "@/components/analytics/AnalyticsFilters";
import { AnalyticsSummary } from "@/components/analytics/AnalyticsSummary";
import { PipelineOverTimeChart } from "@/components/analytics/PipelineOverTimeChart";
import { PipelineCreatedChart } from "@/components/analytics/PipelineCreatedChart";
import { DealDrilldownTable } from "@/components/analytics/DealDrilldownTable";

// ── Types ──

interface PipelineInfo {
  pipeline: string;
  pipeline_name: string;
  deal_count: number;
}

interface OwnerInfo {
  id: string;
  name: string;
  dealCount: number;
  totalValue: number;
}

interface SeriesData {
  id: string;
  label: string;
  data: { time: number; value: number }[];
}

interface SummaryData {
  current: number;
  start: number;
  change: number;
  changePercent: number;
}

interface CreatedData {
  daily: { day: string; value: number; count: number }[];
  cumulative: { day: string; value: number }[];
  total: number;
  dealCount: number;
}

interface DrilldownDeal {
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

// ── Helpers ──

function getQuarterOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const quarters: string[] = [];
  for (let y = year; y >= year - 1; y--) {
    for (let q = 4; q >= 1; q--) {
      quarters.push(`${y}-Q${q}`);
    }
  }
  return quarters;
}

function getCurrentQuarter(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

function getPreviousQuarter(quarter: string): { start: string; end: string } {
  const match = quarter.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return { start: "", end: "" };
  let year = parseInt(match[1]);
  let q = parseInt(match[2]) - 1;
  if (q === 0) { q = 4; year--; }
  const startMonth = (q - 1) * 3;
  return {
    start: new Date(year, startMonth, 1).toISOString(),
    end: new Date(year, startMonth + 3, 1).toISOString(),
  };
}

// ── Component ──

export default function AnalyticsPage() {
  // Filter state
  const [selectedQuarters, setSelectedQuarters] = useState<string[]>([getCurrentQuarter()]);
  const [pipelines, setPipelines] = useState<PipelineInfo[]>([]);
  const [pipelineFilter, setPipelineFilter] = useState<string[]>([]);
  const [dealTypeFilter, setDealTypeFilter] = useState("all");
  const [owners, setOwners] = useState<OwnerInfo[]>([]);
  const [ownerFilter, setOwnerFilter] = useState<string[]>([]);
  const [granularity, setGranularity] = useState("day");
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [breakdown, setBreakdown] = useState("total");
  const [metric, setMetric] = useState("value");

  // Data state
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pipelineSeries, setPipelineSeries] = useState<SeriesData[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<SummaryData | null>(null);
  const [createdPrimary, setCreatedPrimary] = useState<CreatedData | null>(null);
  const [createdComparison, setCreatedComparison] = useState<CreatedData | null>(null);
  const [periodChange, setPeriodChange] = useState<{ valueDelta: number; countDelta: number; percentChange: number } | null>(null);
  const [openPipeline, setOpenPipeline] = useState(0);
  const [weightedPipeline, setWeightedPipeline] = useState(0);
  const [leftToRun, setLeftToRun] = useState(0);
  const [leftToRunCount, setLeftToRunCount] = useState(0);

  // Drill-down state
  const [drilldownDeals, setDrilldownDeals] = useState<DrilldownDeal[]>([]);
  const [drilldownTotal, setDrilldownTotal] = useState({ count: 0, value: 0 });
  const [drilldownSort, setDrilldownSort] = useState("amount");
  const [drilldownOrder, setDrilldownOrder] = useState("desc");

  const activeRequest = useRef(0);

  // Build URL params
  const qParam = selectedQuarters.length > 0 ? `&quarter=${selectedQuarters.join(",")}` : "";
  const pParam = pipelineFilter.length > 0 ? `&pipeline=${pipelineFilter.join(",")}` : "";
  const dtParam = dealTypeFilter !== "all" ? `&dealType=${dealTypeFilter}` : "";
  const oParam = ownerFilter.length > 0 ? `&owner=${ownerFilter.join(",")}` : "";

  // Fetch data
  const fetchData = useCallback(async () => {
    const reqId = ++activeRequest.current;
    setIsLoading(true);

    const isStale = () => activeRequest.current !== reqId;

    try {
      // Comparison params
      let compareParams = "";
      if (comparisonEnabled && selectedQuarters.length === 1) {
        const prev = getPreviousQuarter(selectedQuarters[0]);
        if (prev.start) {
          compareParams = `&compareStart=${prev.start}&compareEnd=${prev.end}`;
        }
      }

      const [
        pipelineOverTimeRes,
        createdRes,
        leftToRunRes,
        pipelineValueRes,
        syncStatusRes,
        dealsRes,
      ] = await Promise.all([
        fetch(`/api/analytics?type=pipeline-over-time&granularity=${granularity}&breakdown=${breakdown}&metric=${metric}${qParam}${pParam}${dtParam}${oParam}`),
        fetch(`/api/analytics?type=pipeline-created${qParam}${pParam}${dtParam}${oParam}${compareParams}`),
        fetch(`/api/analytics?type=left-to-run${qParam}${pParam}${dtParam}${oParam}`),
        fetch(`/api/hubspot?type=pipeline-value${pParam}${dtParam}${qParam}`),
        fetch("/api/hubspot?type=sync-status"),
        fetch(`/api/analytics?type=deal-drilldown&sort=${drilldownSort}&order=${drilldownOrder}&limit=50${qParam}${pParam}${dtParam}${oParam}`),
      ]);

      if (isStale()) return;

      if (pipelineOverTimeRes.ok) {
        const d = await pipelineOverTimeRes.json();
        if (!isStale()) {
          setPipelineSeries(d.series || []);
          setPipelineSummary(d.summary || null);
        }
      }

      if (createdRes.ok) {
        const d = await createdRes.json();
        if (!isStale()) {
          setCreatedPrimary(d.primary || null);
          setCreatedComparison(d.comparison || null);
          setPeriodChange(d.periodChange || null);
        }
      }

      if (leftToRunRes.ok) {
        const d = await leftToRunRes.json();
        if (!isStale()) {
          setLeftToRun(d.totalValue || 0);
          setLeftToRunCount(d.dealCount || 0);
          setWeightedPipeline(d.weightedValue || 0);
        }
      }

      if (pipelineValueRes.ok) {
        const d = await pipelineValueRes.json();
        if (!isStale()) {
          setOpenPipeline(d.filteredValue ?? (d.totalValue || 0));
        }
      }

      if (syncStatusRes.ok) {
        const d = await syncStatusRes.json();
        if (!isStale()) {
          const meta = d.meta || [];
          const incr = meta.find((m: { key: string }) => m.key === "last_incremental_sync");
          const full = meta.find((m: { key: string }) => m.key === "last_full_sync");
          setSyncMeta({
            lastIncremental: incr?.value || null,
            lastFull: full?.value || null,
          });
        }
      }

      if (dealsRes.ok) {
        const d = await dealsRes.json();
        if (!isStale()) {
          setDrilldownDeals(d.deals || []);
          setDrilldownTotal({ count: d.totalCount || 0, value: d.totalValue || 0 });
        }
      }
    } catch (err) {
      console.error("[analytics] fetch error:", err);
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }, [selectedQuarters, pipelineFilter, dealTypeFilter, ownerFilter, granularity, breakdown, metric, comparisonEnabled, drilldownSort, drilldownOrder, qParam, pParam, dtParam, oParam]);

  // Fetch reference data on mount
  useEffect(() => {
    async function loadRefData() {
      const [pipelinesRes, ownersRes] = await Promise.all([
        fetch("/api/hubspot?type=pipeline-list"),
        fetch("/api/analytics?type=owners-list"),
      ]);
      if (pipelinesRes.ok) {
        const d = await pipelinesRes.json();
        setPipelines(d.pipelines || []);
      }
      if (ownersRes.ok) {
        const d = await ownersRes.json();
        setOwners(d.owners || []);
      }
    }
    loadRefData();
  }, []);

  // Fetch data on filter change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 2 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Sort change just updates state — fetchData will re-run via dependency


  // Theme detection
  const [theme, setTheme] = useState("terminal");
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme") || "terminal";
    setTheme(t);
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.getAttribute("data-theme") || "terminal");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Pipeline toggle helper
  const togglePipeline = (id: string) => {
    setPipelineFilter(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] transition-colors duration-300">
      <StatusBar
        lastUpdated={null}
        isLoading={isLoading}
        onRefresh={fetchData}
        syncMeta={syncMeta}
        currentPage="analytics"
      />

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Filters */}
        <AnalyticsFilters
          quarters={selectedQuarters}
          setQuarters={setSelectedQuarters}
          pipelines={pipelines}
          pipelineFilter={pipelineFilter}
          setPipelineFilter={setPipelineFilter}
          dealTypeFilter={dealTypeFilter}
          setDealTypeFilter={setDealTypeFilter}
          owners={owners}
          ownerFilter={ownerFilter}
          setOwnerFilter={setOwnerFilter}
          granularity={granularity}
          setGranularity={setGranularity}
          comparisonEnabled={comparisonEnabled}
          setComparisonEnabled={setComparisonEnabled}
        />

        {/* KPI Summary */}
        <AnalyticsSummary
          openPipeline={openPipeline}
          weightedPipeline={weightedPipeline}
          createdPipeline={createdPrimary?.total || 0}
          createdCount={createdPrimary?.dealCount || 0}
          leftToRun={leftToRun}
          leftToRunCount={leftToRunCount}
        />

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <PipelineOverTimeChart
            series={pipelineSeries}
            summary={pipelineSummary}
            breakdown={breakdown}
            setBreakdown={setBreakdown}
            metric={metric}
            setMetric={setMetric}
            theme={theme}
            onDataPointClick={undefined}
          />
          <PipelineCreatedChart
            primary={createdPrimary}
            comparison={createdComparison}
            periodChange={periodChange}
            comparisonEnabled={comparisonEnabled}
            theme={theme}
          />
        </div>

        {/* Deal Pipeline Table — always visible, updates with filters */}
        <DealDrilldownTable
          deals={drilldownDeals}
          totalCount={drilldownTotal.count}
          totalValue={drilldownTotal.value}
          sort={drilldownSort}
          order={drilldownOrder}
          onSortChange={(s, o) => { setDrilldownSort(s); setDrilldownOrder(o); }}
          persistent={true}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-color)] py-3 px-6">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--text-muted)]">
            RevRadar Analytics
          </span>
          <span className="font-mono text-[10px] text-[var(--text-muted)] hidden sm:inline">
            auto-refresh: 2 min
          </span>
        </div>
      </footer>
    </div>
  );
}
