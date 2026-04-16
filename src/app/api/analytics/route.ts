import { query } from "@/lib/db";
import {
  STAGE_WEIGHT_MAP,
  parseQuarters,
  quarterCondition,
  dealTypeCondition,
  pipelineCondition,
  ownerCondition,
  dateRangeCondition,
  type QueryParams,
} from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

// Stage weight CASE expression for SQL (weighted pipeline calculation)
function stageWeightCase(stageCol: string): string {
  const cases = Object.entries(STAGE_WEIGHT_MAP)
    .map(([id, weight]) => `WHEN ${stageCol} = '${id}' THEN ${weight}`)
    .join(" ");
  return `CASE ${cases} ELSE 0.0 END`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "pipeline-over-time";

  // Shared filters
  const quarters = parseQuarters(searchParams.get("quarter"));
  const pipelineFilter = searchParams.get("pipeline");
  const dealTypeFilter = searchParams.get("dealType");
  const ownerFilter = searchParams.get("owner");

  // Date range (overrides quarter if provided)
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");

  // Compute effective date range
  let effectiveStart: string | null = startParam;
  let effectiveEnd: string | null = endParam;
  if (!effectiveStart && quarters.length > 0) {
    effectiveStart = quarters.reduce((min, q) => q.start < min ? q.start : min, quarters[0].start).toISOString();
    effectiveEnd = quarters.reduce((max, q) => q.end > max ? q.end : max, quarters[0].end).toISOString();
  }
  // Default to last 90 days if nothing specified
  if (!effectiveStart) {
    const now = new Date();
    effectiveStart = new Date(now.getTime() - 90 * 86400000).toISOString();
    effectiveEnd = now.toISOString();
  }

  try {
    switch (type) {
      case "pipeline-over-time": {
        const granularity = searchParams.get("granularity") || "day";
        const metric = searchParams.get("metric") || "value";
        const breakdown = searchParams.get("breakdown") || "total";

        const bucketInterval = granularity === "month" ? "1 month" : granularity === "week" ? "1 week" : "1 day";

        const params: QueryParams = [bucketInterval, effectiveStart, effectiveEnd!];
        const conditions: string[] = [
          "ps.snapshot_time >= $2 AND ps.snapshot_time < $3",
          "ps.stage_name NOT ILIKE '%closed%'",
          "ps.stage_name NOT ILIKE '%renewed%'",
          "ps.stage_name NOT ILIKE '%churn%'",
        ];

        const pc = pipelineCondition(pipelineFilter, "ps.pipeline", params);
        if (pc) conditions.push(pc);

        // For owner/dealType filtering, we need to join to deals table
        // Pipeline snapshots don't have owner_id or deal_type
        // When these filters are active, fall back to deals-based query
        const needsDealsJoin = ownerFilter || dealTypeFilter;

        if (needsDealsJoin) {
          // Deals-based query: aggregate current deals grouped by bucket
          // This shows "current pipeline as of now" sliced by time of snapshot
          // Less precise but necessary for owner/dealType filtering
          const dParams: QueryParams = [];
          const dConditions: string[] = [
            "d.stage_name NOT ILIKE '%closed%'",
            "d.stage_name NOT ILIKE '%renewed%'",
            "d.stage_name NOT ILIKE '%churn%'",
            "d.pipeline IS NOT NULL",
          ];

          const dpc = pipelineCondition(pipelineFilter, "d.pipeline", dParams);
          if (dpc) dConditions.push(dpc);
          const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", dParams);
          if (dtc) dConditions.push(dtc);
          const oc = ownerCondition(ownerFilter, "d.owner_id", dParams);
          if (oc) dConditions.push(oc);

          // For deals-based, we return current state grouped by stage
          const groupCol = breakdown === "stage" ? "d.stage_name" : breakdown === "dealtype" ? "d.deal_type" : "'total'";

          const result = await query(
            `SELECT ${groupCol} as group_key,
                    COUNT(*)::integer as deal_count,
                    COALESCE(SUM(d.amount), 0)::numeric as total_value,
                    COALESCE(SUM(d.amount * ${stageWeightCase("d.deal_stage")}), 0)::numeric as weighted_value
             FROM deals d
             WHERE ${dConditions.join(" AND ")}
             GROUP BY ${groupCol}
             ORDER BY ${groupCol}`,
            dParams
          );

          // Return as single-point series (current snapshot only when owner/type filter active)
          const now = Math.floor(Date.now() / 1000);
          const series = result.rows.map((r: Record<string, string>) => ({
            id: r.group_key || "total",
            label: r.group_key || "Total",
            data: [{ time: now, value: metric === "count" ? parseInt(r.deal_count) : metric === "weighted" ? parseFloat(r.weighted_value) : parseFloat(r.total_value) }],
          }));

          return Response.json({ series, summary: null, note: "Owner/type filter active — showing current state only" });
        }

        // Standard snapshot-based query (fast, pre-aggregated)
        const groupCol = breakdown === "stage" ? ", ps.stage_name" : breakdown === "dealtype" ? ", ps.pipeline_name" : "";
        const selectGroup = breakdown === "stage" ? "ps.stage_name as group_key," : breakdown === "dealtype" ? "ps.pipeline_name as group_key," : "'total' as group_key,";

        const result = await query(
          `SELECT time_bucket($1::interval, ps.snapshot_time) AS bucket,
                  ${selectGroup}
                  SUM(ps.deal_count)::integer as deal_count,
                  SUM(ps.total_value)::numeric as total_value,
                  SUM(ps.weighted_value)::numeric as weighted_value
           FROM pipeline_snapshots ps
           WHERE ${conditions.join(" AND ")}
           GROUP BY bucket${groupCol}
           ORDER BY bucket${groupCol}`,
          params
        );

        // Group by series
        const seriesMap = new Map<string, { time: number; value: number }[]>();
        for (const r of result.rows) {
          const key = r.group_key || "total";
          if (!seriesMap.has(key)) seriesMap.set(key, []);
          const val = metric === "count" ? parseInt(r.deal_count) : metric === "weighted" ? parseFloat(r.weighted_value) : parseFloat(r.total_value);
          seriesMap.get(key)!.push({
            time: Math.floor(new Date(r.bucket).getTime() / 1000),
            value: val,
          });
        }

        // Deduplicate: keep only the LAST snapshot per bucket per group
        const series = Array.from(seriesMap.entries()).map(([id, data]) => {
          const deduped = new Map<number, number>();
          for (const d of data) deduped.set(d.time, d.value);
          const sorted = Array.from(deduped.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([time, value]) => ({ time, value }));
          return { id, label: id, data: sorted };
        });

        // Summary: compare first and last values
        const allValues = series.flatMap(s => s.data);
        const firstVal = allValues.length > 0 ? allValues[0].value : 0;
        const lastVal = allValues.length > 0 ? allValues[allValues.length - 1].value : 0;

        return Response.json({
          series,
          summary: {
            current: lastVal,
            start: firstVal,
            change: lastVal - firstVal,
            changePercent: firstVal > 0 ? ((lastVal - firstVal) / firstVal) * 100 : 0,
          },
        });
      }

      case "pipeline-created": {
        const cumulative = searchParams.get("cumulative") !== "false";
        const compareStart = searchParams.get("compareStart");
        const compareEnd = searchParams.get("compareEnd");

        async function fetchCreated(start: string, end: string) {
          const params: QueryParams = [start, end];
          const conditions: string[] = [
            "d.created_at >= $1 AND d.created_at < $2",
            "d.pipeline IS NOT NULL",
          ];
          const pc = pipelineCondition(pipelineFilter, "d.pipeline", params);
          if (pc) conditions.push(pc);
          const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
          if (dtc) conditions.push(dtc);
          const oc = ownerCondition(ownerFilter, "d.owner_id", params);
          if (oc) conditions.push(oc);

          const result = await query(
            `SELECT DATE(d.created_at) as day,
                    COUNT(*)::integer as count,
                    COALESCE(SUM(d.amount), 0)::numeric as value
             FROM deals d
             WHERE ${conditions.join(" AND ")}
             GROUP BY DATE(d.created_at)
             ORDER BY day`,
            params
          );

          const daily = result.rows.map((r: Record<string, string>) => ({
            day: r.day,
            value: parseFloat(r.value),
            count: parseInt(r.count),
          }));

          // Build cumulative
          let runningValue = 0;
          const cumulativeData = daily.map(d => {
            runningValue += d.value;
            return { day: d.day, value: runningValue };
          });

          return {
            daily,
            cumulative: cumulativeData,
            total: runningValue,
            dealCount: daily.reduce((s, d) => s + d.count, 0),
          };
        }

        const primary = await fetchCreated(effectiveStart!, effectiveEnd!);

        let comparison = null;
        let periodChange = null;
        if (compareStart && compareEnd) {
          comparison = await fetchCreated(compareStart, compareEnd);
          periodChange = {
            valueDelta: primary.total - comparison.total,
            countDelta: primary.dealCount - comparison.dealCount,
            percentChange: comparison.total > 0 ? ((primary.total - comparison.total) / comparison.total) * 100 : 0,
          };
        }

        return Response.json({ primary, comparison, periodChange });
      }

      case "left-to-run": {
        const targetParam = searchParams.get("target");
        const target = targetParam ? parseFloat(targetParam) : null;

        const params: QueryParams = [];
        const conditions: string[] = [
          "d.stage_name NOT ILIKE '%closed%'",
          "d.stage_name NOT ILIKE '%renewed%'",
          "d.stage_name NOT ILIKE '%churn%'",
          "d.pipeline IS NOT NULL",
        ];

        // Quarter filter on close_date
        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "d.close_date", params);
          if (qc) conditions.push(qc);
        }

        const pc = pipelineCondition(pipelineFilter, "d.pipeline", params);
        if (pc) conditions.push(pc);
        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);
        const oc = ownerCondition(ownerFilter, "d.owner_id", params);
        if (oc) conditions.push(oc);

        const result = await query(
          `SELECT COUNT(*)::integer as deal_count,
                  COALESCE(SUM(d.amount), 0)::numeric as total_value,
                  COALESCE(SUM(d.amount * ${stageWeightCase("d.deal_stage")}), 0)::numeric as weighted_value,
                  d.stage_name, COUNT(*)::integer as stage_count, COALESCE(SUM(d.amount), 0)::numeric as stage_value
           FROM deals d
           WHERE ${conditions.join(" AND ")}
           GROUP BY d.stage_name
           ORDER BY d.stage_name`,
          params
        );

        const byStage = result.rows.map((r: Record<string, string>) => ({
          stage: r.stage_name,
          value: parseFloat(r.stage_value),
          count: parseInt(r.stage_count),
        }));

        const totalValue = byStage.reduce((s, st) => s + st.value, 0);
        const totalCount = byStage.reduce((s, st) => s + st.count, 0);
        const weightedValue = result.rows.reduce((s: number, r: Record<string, string>) =>
          s + parseFloat(r.stage_value) * (STAGE_WEIGHT_MAP[r.stage_name] || 0), 0);

        return Response.json({
          totalValue,
          weightedValue,
          dealCount: totalCount,
          coverageRatio: target ? totalValue / target : null,
          byStage,
        });
      }

      case "deal-drilldown": {
        const sort = searchParams.get("sort") || "amount";
        const order = searchParams.get("order") || "desc";
        const limit = parseInt(searchParams.get("limit") || "50");
        const offset = parseInt(searchParams.get("offset") || "0");
        const stageFilter = searchParams.get("stage");

        const params: QueryParams = [];
        const conditions: string[] = [
          "d.stage_name NOT ILIKE '%closed%'",
          "d.stage_name NOT ILIKE '%renewed%'",
          "d.stage_name NOT ILIKE '%churn%'",
          "d.pipeline IS NOT NULL",
        ];

        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "d.close_date", params);
          if (qc) conditions.push(qc);
        }
        const pc = pipelineCondition(pipelineFilter, "d.pipeline", params);
        if (pc) conditions.push(pc);
        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);
        const oc = ownerCondition(ownerFilter, "d.owner_id", params);
        if (oc) conditions.push(oc);
        if (stageFilter) {
          params.push(stageFilter);
          conditions.push(`d.stage_name = $${params.length}`);
        }

        // Get deals with health indicators
        const sortCol = sort === "days_in_stage" ? "days_in_stage"
          : sort === "close_date" ? "d.close_date"
          : sort === "deal_name" ? "d.deal_name"
          : "d.amount";
        const sortDir = order === "asc" ? "ASC" : "DESC";

        params.push(limit, offset);

        const result = await query(
          `SELECT d.id, d.deal_name, d.amount, d.stage_name, d.pipeline_name,
                  d.deal_type, d.close_date, d.next_step, d.deal_stage,
                  COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
                  EXTRACT(DAY FROM NOW() - d.stage_entered_at)::integer as days_in_stage
           FROM deals d
           LEFT JOIN owners o ON o.id = d.owner_id
           WHERE ${conditions.join(" AND ")}
           ORDER BY ${sortCol} ${sortDir} NULLS LAST
           LIMIT $${params.length - 1} OFFSET $${params.length}`,
          params
        );

        // Get total count (without limit/offset)
        const countParams = params.slice(0, -2);
        const countResult = await query(
          `SELECT COUNT(*)::integer as total, COALESCE(SUM(d.amount), 0)::numeric as total_value
           FROM deals d
           WHERE ${conditions.join(" AND ")}`,
          countParams
        );

        // Compute health and priority for each deal
        const maxAmount = Math.max(...result.rows.map((r: Record<string, string>) => parseFloat(r.amount || "0")), 1);

        const deals = result.rows.map((r: Record<string, string>) => {
          const amount = parseFloat(r.amount || "0");
          const daysInStage = parseInt(r.days_in_stage) || 0;
          const stageWeight = STAGE_WEIGHT_MAP[r.deal_stage] || 0;

          // Health
          const health = daysInStage < 14 ? "green" : daysInStage < 30 ? "amber" : "red";

          // Priority score (0-100)
          const amountScore = (amount / maxAmount) * 100;
          const stageScore = stageWeight * 100;
          const stalenessScore = Math.min(daysInStage / 60, 1.0) * 100;
          const flagScore = (daysInStage >= 30 ? 30 : 0); // simplified flag detection
          const priorityScore = Math.round(
            amountScore * 0.40 + stageScore * 0.25 + stalenessScore * 0.25 + flagScore * 0.10
          );

          // Flags
          const flags: string[] = [];
          if (daysInStage >= 30) flags.push("stale");
          if (r.close_date && new Date(r.close_date) < new Date()) flags.push("overdue");

          return {
            id: r.id,
            dealName: r.deal_name,
            amount,
            stageName: r.stage_name,
            pipelineName: r.pipeline_name,
            ownerName: r.owner_name,
            daysInStage,
            closeDate: r.close_date || null,
            nextStep: r.next_step || null,
            dealType: r.deal_type || null,
            health,
            priorityScore,
            flags,
          };
        });

        return Response.json({
          deals,
          totalCount: parseInt(countResult.rows[0]?.total || "0"),
          totalValue: parseFloat(countResult.rows[0]?.total_value || "0"),
        });
      }

      case "owners-list": {
        const result = await query(
          `SELECT o.id,
                  COALESCE(o.first_name || ' ' || o.last_name, 'Unknown') as name,
                  COUNT(d.id)::integer as deal_count,
                  COALESCE(SUM(d.amount), 0)::numeric as total_value
           FROM owners o
           INNER JOIN deals d ON d.owner_id = o.id
           WHERE d.stage_name NOT ILIKE '%closed%'
             AND d.stage_name NOT ILIKE '%renewed%'
             AND d.stage_name NOT ILIKE '%churn%'
             AND d.pipeline IS NOT NULL
           GROUP BY o.id, o.first_name, o.last_name
           HAVING COUNT(d.id) > 0
           ORDER BY SUM(d.amount) DESC NULLS LAST`
        );

        return Response.json({
          owners: result.rows.map((r: Record<string, string>) => ({
            id: r.id,
            name: r.name,
            dealCount: parseInt(r.deal_count),
            totalValue: parseFloat(r.total_value),
          })),
        });
      }

      case "rep-comparison": {
        const params: QueryParams = [];
        const conditions: string[] = ["d.pipeline IS NOT NULL"];

        const pc = pipelineCondition(pipelineFilter, "d.pipeline", params);
        if (pc) conditions.push(pc);
        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);

        // Open pipeline per rep
        const openResult = await query(
          `SELECT d.owner_id,
                  COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as name,
                  COUNT(*)::integer as open_deals,
                  COALESCE(SUM(d.amount), 0)::numeric as open_pipeline,
                  AVG(EXTRACT(DAY FROM NOW() - d.stage_entered_at))::integer as avg_days_in_stage,
                  COUNT(*) FILTER (WHERE d.stage_entered_at < NOW() - INTERVAL '30 days')::integer as stale_count
           FROM deals d
           LEFT JOIN owners o ON o.id = d.owner_id
           WHERE d.stage_name NOT ILIKE '%closed%'
             AND d.stage_name NOT ILIKE '%renewed%'
             AND d.stage_name NOT ILIKE '%churn%'
             AND ${conditions.join(" AND ")}
           GROUP BY d.owner_id, o.first_name, o.last_name
           ORDER BY SUM(d.amount) DESC NULLS LAST`,
          params
        );

        // Created + Won + Lost per rep (in date range)
        const activityParams: QueryParams = [effectiveStart!, effectiveEnd!];
        const actConditions = [...conditions];
        // Re-add pipeline/dealType conditions with new param positions
        const actPc = pipelineCondition(pipelineFilter, "cl.pipeline", activityParams);
        if (actPc) actConditions.push(actPc);

        const createdResult = await query(
          `SELECT d.owner_id,
                  COUNT(*) FILTER (WHERE d.created_at >= $1 AND d.created_at < $2)::integer as created_count,
                  COALESCE(SUM(d.amount) FILTER (WHERE d.created_at >= $1 AND d.created_at < $2), 0)::numeric as created_value
           FROM deals d
           WHERE d.pipeline IS NOT NULL AND d.created_at >= $1 AND d.created_at < $2
           GROUP BY d.owner_id`,
          [effectiveStart!, effectiveEnd!]
        );

        // Merge results
        const createdMap = new Map<string, { createdCount: number; createdValue: number }>();
        for (const r of createdResult.rows) {
          createdMap.set(r.owner_id, {
            createdCount: parseInt(r.created_count),
            createdValue: parseFloat(r.created_value),
          });
        }

        const reps = openResult.rows.map((r: Record<string, string>) => {
          const created = createdMap.get(r.owner_id) || { createdCount: 0, createdValue: 0 };
          return {
            id: r.owner_id,
            name: r.name,
            openPipeline: parseFloat(r.open_pipeline),
            openDeals: parseInt(r.open_deals),
            createdValue: created.createdValue,
            createdCount: created.createdCount,
            avgDaysInStage: parseInt(r.avg_days_in_stage) || 0,
            staleCount: parseInt(r.stale_count),
          };
        });

        return Response.json({ reps });
      }

      default:
        return Response.json({ error: `Unknown analytics type: ${type}` }, { status: 400 });
    }
  } catch (err) {
    console.error(`[analytics] Error for type=${type}:`, err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
