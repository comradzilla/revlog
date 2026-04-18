import { query } from "@/lib/db";
import {
  UPSELL_TYPES,
  NEW_BIZ_TYPES,
  STAGE_WEIGHT_MAP,
  parseQuarters,
  quarterCondition,
  dealTypeCondition,
  pipelineCondition,
  isStageRegression,
} from "@/lib/query-helpers";
import { buildHealthCte, breakdownFor } from "@/lib/health";
import { getHealthWeights } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "changelog";
  const quarters = parseQuarters(searchParams.get("quarter"));
  const pipelineFilter = searchParams.get("pipeline");
  const dealTypeFilter = searchParams.get("dealType");

  try {
    switch (type) {
      case "changelog": {
        const limit = parseInt(searchParams.get("limit") || "200");
        const params: (string | number | Date | string[])[] = [];
        const conditions: string[] = [];

        // Always join deals + owners for owner name and deal type filtering
        let sql = `SELECT cl.deal_id, cl.deal_name, cl.pipeline, cl.pipeline_name, cl.property,
                    cl.property_label, cl.old_value, cl.new_value, cl.old_label, cl.new_label,
                    cl.changed_at as timestamp, cl.source_type,
                    COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name
             FROM deal_changelog cl
             LEFT JOIN deals d ON d.id = cl.deal_id
             LEFT JOIN owners o ON o.id = d.owner_id`;

        const qc = quarterCondition(quarters, "cl.changed_at", params);
        if (qc) conditions.push(qc);

        const pc = pipelineCondition(pipelineFilter, "cl.pipeline", params);
        if (pc) conditions.push(pc);

        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(" AND ")}`;
        }

        sql += ` ORDER BY cl.changed_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        const changelogs = result.rows.map((r: Record<string, string>) => {
          const isStage = r.property === "dealstage";
          return {
            dealId: r.deal_id,
            dealName: r.deal_name,
            pipeline: r.pipeline,
            pipelineName: r.pipeline_name,
            property: r.property,
            propertyLabel: r.property_label,
            oldValue: r.old_value,
            newValue: r.new_value,
            oldLabel: r.old_label,
            newLabel: r.new_label,
            timestamp: r.timestamp,
            sourceType: r.source_type,
            ownerName: r.owner_name,
            isRegression: isStage ? isStageRegression(r.old_label || "", r.new_label || "") : false,
          };
        });
        return Response.json({ changelogs });
      }

      case "recently-changed": {
        const limit = parseInt(searchParams.get("limit") || "15");
        const params: (string | number | Date | string[])[] = [];
        const conditions: string[] = [];

        const qc = quarterCondition(quarters, "cl.changed_at", params);
        if (qc) conditions.push(qc);

        const pc = pipelineCondition(pipelineFilter, "cl.pipeline", params);
        if (pc) conditions.push(pc);

        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const weights = await getHealthWeights();
        const sql = `
          ${buildHealthCte(weights)}
          SELECT * FROM (
            SELECT DISTINCT ON (d.id)
              d.id, d.deal_name, d.pipeline_name, d.stage_name as current_stage_name,
              d.amount, cl.changed_at as last_modified, cl.property as change_type,
              d.deal_type, d.stage_entered_at, d.next_step,
              COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
              h.health_score, h.regression_count, h.slip_count, h.amount_net, h.next_step_last_update
            FROM deals d
            INNER JOIN deal_changelog cl ON cl.deal_id = d.id
            LEFT JOIN owners o ON o.id = d.owner_id
            LEFT JOIN deal_health h ON h.deal_id = d.id
            ${whereClause}
            ORDER BY d.id, cl.changed_at DESC
          ) sub
          ORDER BY last_modified DESC
          LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        const deals = result.rows.map((r: Record<string, string | number | null>) => {
          const score = r.health_score === null ? null : parseInt(String(r.health_score));
          const breakdown = breakdownFor({
            health_score: score,
            regression_count: parseInt(String(r.regression_count ?? 0)),
            slip_count: parseInt(String(r.slip_count ?? 0)),
            amount_net: parseFloat(String(r.amount_net ?? 0)),
            next_step_last_update: r.next_step_last_update as string | null,
            stage_entered_at: r.stage_entered_at as string | null,
            stage_name: r.current_stage_name as string | null,
            next_step: r.next_step as string | null,
          }, weights);
          return {
            id: r.id,
            dealName: r.deal_name,
            pipelineName: r.pipeline_name,
            currentStageName: r.current_stage_name,
            stageNumber: 0,
            amount: parseFloat(String(r.amount || "0")),
            lastModified: r.last_modified,
            ownerName: r.owner_name,
            changeType: r.change_type,
            dealType: r.deal_type,
            stageEnteredAt: r.stage_entered_at,
            healthScore: score,
            healthBucket: breakdown.bucket,
            healthPenalties: breakdown.penalties,
            regressionCount: parseInt(String(r.regression_count ?? 0)),
            slipCount: parseInt(String(r.slip_count ?? 0)),
            amountNet: parseFloat(String(r.amount_net ?? 0)),
          };
        });
        return Response.json({ deals });
      }

      case "changes-count": {
        const ccResult = await query(
          `SELECT
             COUNT(*) FILTER (WHERE changed_at >= NOW() - INTERVAL '7 days')::integer as week,
             COUNT(*) FILTER (WHERE changed_at >= CURRENT_DATE)::integer as today
           FROM deal_changelog
           WHERE property IN ('dealstage','amount','closedate','hubspot_owner_id')`
        );
        const ccRow = ccResult.rows[0] || { week: 0, today: 0 };
        return Response.json({
          weekChanges: parseInt(ccRow.week) || 0,
          todayChanges: parseInt(ccRow.today) || 0,
        });
      }

      case "pipeline-stats": {
        const pipelineId = searchParams.get("pipeline") || "4207989";
        const psParams: (string | string[])[] = [pipelineId];
        const psConditions = ["pipeline = $1"];

        // Add quarter filter on close_date
        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "close_date", psParams);
          if (qc) psConditions.push(qc);
        }

        const result = await query(
          `SELECT deal_stage as "stageId", stage_name as label,
                  COUNT(*)::integer as count,
                  COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE ${psConditions.join(" AND ")}
           GROUP BY deal_stage, stage_name
           ORDER BY stage_name`,
          psParams
        );
        const stats = result.rows.map((r: Record<string, string>) => ({
          stageId: r.stageId,
          label: r.label,
          count: parseInt(String(r.count)),
          total_value: parseFloat(String(r.total_value)),
        }));
        const totalCount = stats.reduce((s, r) => s + r.count, 0);
        const totalValue = stats.reduce((s, r) => s + r.total_value, 0);
        return Response.json({ stats, totalCount, totalValue });
      }

      case "dealtype-stats": {
        const dtParam = searchParams.get("dealType") || "upsell";
        const types = dtParam === "upsell" ? UPSELL_TYPES : NEW_BIZ_TYPES;
        const dtPipeline = searchParams.get("dtPipeline");

        const dtParams: (string | string[])[] = [types];
        let dtWhere = `deal_type = ANY($1)
             AND stage_name NOT ILIKE '%closed lost%'
             AND stage_name NOT ILIKE '%churn%'`;

        if (dtPipeline && dtPipeline !== "all") {
          dtParams.push(dtPipeline);
          dtWhere += ` AND pipeline = $${dtParams.length}`;
        }

        // Add quarter filter on close_date
        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "close_date", dtParams);
          if (qc) dtWhere += ` AND ${qc}`;
        }

        const result = await query(
          `SELECT stage_name as label, deal_stage as "stageId",
                  COUNT(*)::integer as count,
                  COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE ${dtWhere}
           GROUP BY deal_stage, stage_name
           ORDER BY stage_name`,
          dtParams
        );

        const pipelinesResult = await query(
          `SELECT DISTINCT pipeline, pipeline_name, COUNT(*)::integer as count
           FROM deals WHERE deal_type = ANY($1)
             AND stage_name NOT ILIKE '%closed lost%' AND stage_name NOT ILIKE '%churn%'
           GROUP BY pipeline, pipeline_name ORDER BY count DESC`,
          [types]
        );

        const stats = result.rows.map((r: Record<string, string>) => ({
          stageId: r.stageId,
          label: r.label,
          count: parseInt(String(r.count)),
          total_value: parseFloat(String(r.total_value)),
        }));
        const totalCount = stats.reduce((s, r) => s + r.count, 0);
        const totalValue = stats.reduce((s, r) => s + r.total_value, 0);
        return Response.json({
          stats, totalCount, totalValue,
          pipelines: pipelinesResult.rows,
        });
      }

      case "pipeline-value": {
        // Global total (always unfiltered)
        const globalResult = await query(
          `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE stage_name NOT ILIKE '%closed%'
             AND stage_name NOT ILIKE '%renewed%'
             AND stage_name NOT ILIKE '%churn%'
             AND pipeline IS NOT NULL`
        );
        const globalRow = globalResult.rows[0];
        const totalValue = parseFloat(globalRow.total_value);
        const count = globalRow.count;

        // Filtered total (pipeline + dealType + quarter on close_date)
        const hasFilters = (pipelineFilter && pipelineFilter !== "all") || (dealTypeFilter && dealTypeFilter !== "all") || quarters.length > 0;
        let filteredValue: number | null = null;
        let filteredCount: number | null = null;

        if (hasFilters) {
          const fParams: (string | number | Date | string[])[] = [];
          const fConditions: string[] = [
            "stage_name NOT ILIKE '%closed%'",
            "stage_name NOT ILIKE '%renewed%'",
            "stage_name NOT ILIKE '%churn%'",
            "pipeline IS NOT NULL",
          ];
          const fpc = pipelineCondition(pipelineFilter, "pipeline", fParams);
          if (fpc) fConditions.push(fpc);
          const fdtc = dealTypeCondition(dealTypeFilter, "deal_type", fParams);
          if (fdtc) fConditions.push(fdtc);
          const fqc = quarterCondition(quarters, "close_date", fParams);
          if (fqc) fConditions.push(fqc);

          const filteredResult = await query(
            `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
             FROM deals
             WHERE ${fConditions.join(" AND ")}`,
            fParams
          );
          filteredValue = parseFloat(filteredResult.rows[0].total_value);
          filteredCount = filteredResult.rows[0].count;
        }

        return Response.json({ totalValue, count, filteredValue, filteredCount });
      }

      case "weighted-pipeline": {
        const weightCases = Object.entries(STAGE_WEIGHT_MAP)
          .map(([stageId, weight]) => `WHEN deal_stage = '${stageId}' THEN ${weight}`)
          .join("\n          ");

        const result = await query(
          `SELECT
             COALESCE(SUM(amount), 0)::numeric as raw_value,
             COALESCE(SUM(amount * CASE
               ${weightCases}
               ELSE 0.0
             END), 0)::numeric as weighted_value
           FROM deals
           WHERE stage_name NOT ILIKE '%closed%'
             AND stage_name NOT ILIKE '%renewed%'
             AND stage_name NOT ILIKE '%churn%'
             AND pipeline IS NOT NULL`
        );
        const row = result.rows[0];
        return Response.json({
          rawValue: parseFloat(row.raw_value),
          weightedValue: parseFloat(row.weighted_value),
        });
      }

      case "pipeline-list": {
        const result = await query(
          `SELECT pipeline, pipeline_name, COUNT(*)::integer as deal_count
           FROM deals
           WHERE pipeline IS NOT NULL
           GROUP BY pipeline, pipeline_name
           ORDER BY deal_count DESC`
        );
        return Response.json({ pipelines: result.rows });
      }

      case "closed-won": {
        const params: (string | number | Date | string[])[] = [];
        let dateCondition: string;

        if (quarters.length > 0) {
          dateCondition = quarterCondition(quarters, "cl.changed_at", params);
        } else {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          params.push(monthStart.toISOString());
          dateCondition = `cl.changed_at >= $${params.length}`;
        }

        const result = await query(
          `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                  COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
           FROM deal_changelog cl
           JOIN deals d ON d.id = cl.deal_id
           WHERE cl.property = 'dealstage'
             AND (cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%renewed%')
             AND ${dateCondition}`,
          params
        );
        const row = result.rows[0];
        return Response.json({
          totalValue: parseFloat(row.total_value),
          count: row.count,
        });
      }

      case "closed-lost": {
        const params: (string | number | Date | string[])[] = [];
        let dateCondition: string;

        if (quarters.length > 0) {
          dateCondition = quarterCondition(quarters, "cl.changed_at", params);
        } else {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          params.push(monthStart.toISOString());
          dateCondition = `cl.changed_at >= $${params.length}`;
        }

        const result = await query(
          `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                  COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
           FROM deal_changelog cl
           JOIN deals d ON d.id = cl.deal_id
           WHERE cl.property = 'dealstage'
             AND (cl.new_label ILIKE '%closed lost%' OR cl.new_label ILIKE '%churn%')
             AND ${dateCondition}`,
          params
        );
        const row = result.rows[0];
        return Response.json({
          totalValue: parseFloat(row.total_value),
          count: row.count,
        });
      }

      case "net-movement": {
        const params: (string | number | Date | string[])[] = [];
        let dateCondition: string;

        if (quarters.length > 0) {
          dateCondition = quarterCondition(quarters, "created_at", params);
        } else {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          params.push(monthStart.toISOString());
          dateCondition = `created_at >= $${params.length}`;
        }

        // Pipeline created (new deals entering)
        const createdResult = await query(
          `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals WHERE ${dateCondition} AND pipeline IS NOT NULL`,
          params
        );

        // Won and Lost from existing closed-won/lost endpoints
        const wonParams: (string | number | Date | string[])[] = [];
        const wonDateCond = quarters.length > 0
          ? quarterCondition(quarters, "cl.changed_at", wonParams)
          : (() => { wonParams.push(params[0]); return `cl.changed_at >= $1`; })();

        const wonResult = await query(
          `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                  COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
           FROM deal_changelog cl JOIN deals d ON d.id = cl.deal_id
           WHERE cl.property = 'dealstage'
             AND (cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%renewed%')
             AND ${wonDateCond}`,
          wonParams
        );

        const lostParams: (string | number | Date | string[])[] = [];
        const lostDateCond = quarters.length > 0
          ? quarterCondition(quarters, "cl.changed_at", lostParams)
          : (() => { lostParams.push(params[0]); return `cl.changed_at >= $1`; })();

        const lostResult = await query(
          `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                  COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
           FROM deal_changelog cl JOIN deals d ON d.id = cl.deal_id
           WHERE cl.property = 'dealstage'
             AND (cl.new_label ILIKE '%closed lost%' OR cl.new_label ILIKE '%churn%')
             AND ${lostDateCond}`,
          lostParams
        );

        const created = { count: createdResult.rows[0].count, value: parseFloat(createdResult.rows[0].total_value) };
        const won = { count: wonResult.rows[0].count, value: parseFloat(wonResult.rows[0].total_value) };
        const lost = { count: lostResult.rows[0].count, value: parseFloat(lostResult.rows[0].total_value) };
        const net = created.value - won.value - lost.value;

        return Response.json({ created, won, lost, net });
      }

      case "amount-movement": {
        const params: (string | number | Date | string[])[] = [];
        const conditions: string[] = ["property = 'amount'"];

        const qc = quarterCondition(quarters, "changed_at", params);
        if (qc) conditions.push(qc);

        const result = await query(
          `SELECT
             COALESCE(SUM(CASE WHEN (NULLIF(new_value,'')::numeric - NULLIF(old_value,'')::numeric) > 0
               THEN (NULLIF(new_value,'')::numeric - NULLIF(old_value,'')::numeric) ELSE 0 END), 0)::numeric as grew,
             COALESCE(SUM(CASE WHEN (NULLIF(new_value,'')::numeric - NULLIF(old_value,'')::numeric) < 0
               THEN ABS(NULLIF(new_value,'')::numeric - NULLIF(old_value,'')::numeric) ELSE 0 END), 0)::numeric as shrank
           FROM deal_changelog
           WHERE ${conditions.join(" AND ")}`,
          params
        );
        const row = result.rows[0];
        const grew = parseFloat(row.grew);
        const shrank = parseFloat(row.shrank);
        return Response.json({ grew, shrank, net: grew - shrank });
      }

      case "pipeline-created-wow": {
        // Pipeline $ created per day over the selected quarter (or last 90 days)
        // Respects pipeline + dealType filters
        const pcParams: (string | string[])[] = [];
        const pcConditions = ["d.pipeline IS NOT NULL"];

        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "d.created_at", pcParams);
          if (qc) pcConditions.push(qc);
        } else {
          const d90 = new Date(Date.now() - 90 * 86400000);
          pcParams.push(d90.toISOString());
          pcConditions.push(`d.created_at >= $${pcParams.length}`);
        }

        const pcPipe = pipelineCondition(pipelineFilter, "d.pipeline", pcParams);
        if (pcPipe) pcConditions.push(pcPipe);
        const pcDt = dealTypeCondition(dealTypeFilter, "d.deal_type", pcParams);
        if (pcDt) pcConditions.push(pcDt);

        const pcResult = await query(
          `SELECT DATE(d.created_at) as day, COALESCE(SUM(d.amount), 0)::numeric as value, COUNT(*)::integer as count
           FROM deals d WHERE ${pcConditions.join(" AND ")}
           GROUP BY DATE(d.created_at) ORDER BY day`, pcParams
        );

        const createdDays = pcResult.rows.map((r: Record<string, string>) => ({
          day: String(r.day), value: parseFloat(r.value), count: parseInt(r.count),
        }));
        const totalCreated = createdDays.reduce((s, d) => s + d.value, 0);
        const totalDealsCreated = createdDays.reduce((s, d) => s + d.count, 0);

        // Compute cumulative for line chart
        let cumCreated = 0;
        const cumulative = createdDays.map((d) => { cumCreated += d.value; return { day: d.day, value: cumCreated }; });

        return Response.json({ daily: createdDays, cumulative, total: totalCreated, dealCount: totalDealsCreated });
      }

      case "bookings-trend": {
        // Cumulative closed-won $ per day over selected quarter or last 90 days
        const bParams: (string | string[])[] = [];
        const bConditions = [
          "cl.property = 'dealstage'",
          "(cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%renewed%')",
        ];

        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "cl.changed_at", bParams);
          if (qc) bConditions.push(qc);
        } else {
          const d90 = new Date(Date.now() - 90 * 86400000);
          bParams.push(d90.toISOString());
          bConditions.push(`cl.changed_at >= $${bParams.length}`);
        }

        const bpc = pipelineCondition(pipelineFilter, "cl.pipeline", bParams);
        if (bpc) bConditions.push(bpc);
        const bdtc = dealTypeCondition(dealTypeFilter, "d.deal_type", bParams);
        if (bdtc) bConditions.push(bdtc);

        const bResult = await query(
          `SELECT DATE(cl.changed_at) as day, COALESCE(SUM(d.amount), 0)::numeric as daily_won
           FROM deal_changelog cl JOIN deals d ON d.id = cl.deal_id
           WHERE ${bConditions.join(" AND ")}
           GROUP BY DATE(cl.changed_at) ORDER BY day`, bParams
        );

        const daily = bResult.rows.map((r: Record<string, string>) => ({ day: r.day, value: parseFloat(r.daily_won) }));
        let cumTotal = 0;
        const cumulative = daily.map((d) => { cumTotal += d.value; return { day: d.day, value: cumTotal }; });

        return Response.json({ daily, cumulative, total: cumTotal });
      }

      case "net-movement-trend": {
        // Daily pipeline movement as candlestick data
        // Each candle: open = pipeline start of day, close = end of day
        // Uses pipeline_snapshots for daily totals + changelog for intraday deltas
        // Respects quarter, pipeline, dealType filters
        const nmParams: (string | string[])[] = [];
        const nmConditions: string[] = ["ps.pipeline IS NOT NULL"];

        if (quarters.length > 0) {
          const qc = quarterCondition(quarters, "ps.snapshot_time", nmParams);
          if (qc) nmConditions.push(qc);
        } else {
          const d90 = new Date(Date.now() - 90 * 86400000);
          nmParams.push(d90.toISOString());
          nmConditions.push(`ps.snapshot_time >= $${nmParams.length}`);
        }

        const nmpc = pipelineCondition(pipelineFilter, "ps.pipeline", nmParams);
        if (nmpc) nmConditions.push(nmpc);

        // Get daily pipeline totals from snapshots (aggregated per day)
        const snapResult = await query(
          `SELECT time_bucket('1 day', ps.snapshot_time) as day,
                  COALESCE(SUM(ps.total_value), 0)::numeric as total_value
           FROM pipeline_snapshots ps
           WHERE ${nmConditions.join(" AND ")}
             AND ps.stage_name NOT ILIKE '%closed%'
             AND ps.stage_name NOT ILIKE '%renewed%'
             AND ps.stage_name NOT ILIKE '%churn%'
           GROUP BY day ORDER BY day`, nmParams
        );

        // Build candlesticks: each day's close is the snapshot total,
        // open = previous day's close, high/low derived from created - lost intraday
        const snapDays = snapResult.rows.map((r: Record<string, string>) => ({
          day: String(r.day),
          value: parseFloat(r.total_value),
        }));

        const candles = snapDays.map((d, i) => {
          const prevValue = i > 0 ? snapDays[i - 1].value : d.value;
          const open = prevValue;
          const close = d.value;
          const high = Math.max(open, close) * 1.01; // slight buffer
          const low = Math.min(open, close) * 0.99;
          return {
            day: d.day,
            time: Math.floor(new Date(d.day).getTime() / 1000),
            open, high, low, close,
            net: close - open,
          };
        });

        // Also build a line version for the toggle
        const lineData = snapDays.map((d) => ({
          time: Math.floor(new Date(d.day).getTime() / 1000),
          value: d.value,
        }));

        const currentValue = snapDays.length > 0 ? snapDays[snapDays.length - 1].value : 0;
        const startValue = snapDays.length > 0 ? snapDays[0].value : 0;
        const netChange = currentValue - startValue;

        return Response.json({ candles, lineData, currentValue, startValue, netChange });
      }

      case "stale-deals": {
        // Stale = in same stage for 30+ days AND next step not updated in 14+ days
        const staleParams: (string | string[])[] = [];
        const staleConditions = [
          "d.stage_entered_at < NOW() - INTERVAL '30 days'",
          "d.stage_name NOT ILIKE '%closed%'",
          "d.stage_name NOT ILIKE '%renewed%'",
          "d.stage_name NOT ILIKE '%churn%'",
          "d.pipeline IS NOT NULL",
        ];
        const pc = pipelineCondition(pipelineFilter, "d.pipeline", staleParams);
        if (pc) staleConditions.push(pc);
        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", staleParams);
        if (dtc) staleConditions.push(dtc);

        const weights = await getHealthWeights();
        const result = await query(
          `${buildHealthCte(weights)}
           SELECT d.id, d.deal_name, d.amount, d.stage_name, d.pipeline_name,
                  d.next_step, d.stage_entered_at,
                  COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
                  EXTRACT(DAY FROM NOW() - d.stage_entered_at)::integer as days_in_stage,
                  MAX(cl.changed_at) as last_next_step_update,
                  h.health_score, h.regression_count, h.slip_count, h.amount_net,
                  h.next_step_last_update as health_next_step_last_update
           FROM deals d
           LEFT JOIN deal_changelog cl ON cl.deal_id = d.id AND cl.property = 'hs_next_step'
           LEFT JOIN owners o ON o.id = d.owner_id
           LEFT JOIN deal_health h ON h.deal_id = d.id
           WHERE ${staleConditions.join(" AND ")}
           GROUP BY d.id, d.deal_name, d.amount, d.stage_name, d.pipeline_name,
                    d.next_step, d.stage_entered_at, o.first_name, o.last_name,
                    h.health_score, h.regression_count, h.slip_count, h.amount_net,
                    h.next_step_last_update
           HAVING MAX(cl.changed_at) IS NULL
               OR MAX(cl.changed_at) < NOW() - INTERVAL '14 days'
           ORDER BY h.health_score ASC NULLS LAST, d.amount DESC NULLS LAST
           LIMIT 50`,
          staleParams
        );

        const deals = result.rows.map((r: Record<string, string | number | null>) => {
          const score = r.health_score === null ? null : parseInt(String(r.health_score));
          const breakdown = breakdownFor({
            health_score: score,
            regression_count: parseInt(String(r.regression_count ?? 0)),
            slip_count: parseInt(String(r.slip_count ?? 0)),
            amount_net: parseFloat(String(r.amount_net ?? 0)),
            next_step_last_update: r.health_next_step_last_update as string | null,
            stage_entered_at: r.stage_entered_at as string | null,
            stage_name: r.stage_name as string | null,
            next_step: r.next_step as string | null,
          }, weights);
          return {
            id: r.id,
            dealName: r.deal_name,
            amount: parseFloat(String(r.amount || "0")),
            stageName: r.stage_name,
            pipelineName: r.pipeline_name,
            ownerName: r.owner_name,
            nextStep: r.next_step || null,
            daysInStage: parseInt(String(r.days_in_stage)) || 0,
            lastNextStepUpdate: r.last_next_step_update || null,
            healthScore: score,
            healthBucket: breakdown.bucket,
            healthPenalties: breakdown.penalties,
            regressionCount: parseInt(String(r.regression_count ?? 0)),
            slipCount: parseInt(String(r.slip_count ?? 0)),
            amountNet: parseFloat(String(r.amount_net ?? 0)),
          };
        });

        const totalValue = deals.reduce((s, d) => s + d.amount, 0);

        return Response.json({ deals, count: deals.length, totalValue });
      }

      case "deal-types": {
        const result = await query(
          `SELECT DISTINCT deal_type, COUNT(*)::integer as count
           FROM deals
           WHERE deal_type IS NOT NULL AND deal_type != ''
           GROUP BY deal_type
           ORDER BY count DESC`
        );
        return Response.json({ dealTypes: result.rows });
      }

      case "sync-status": {
        const result = await query(
          "SELECT key, value, updated_at FROM sync_meta ORDER BY key"
        );
        return Response.json({ meta: result.rows });
      }

      case "pipeline-trend": {
        const days = parseInt(searchParams.get("days") || "30");
        const result = await query(
          `SELECT
             time_bucket('1 day', snapshot_time) AS day,
             pipeline_name,
             SUM(deal_count)::integer AS total_deals,
             SUM(total_value)::numeric AS total_value
           FROM pipeline_snapshots
           WHERE snapshot_time > NOW() - ($1 || ' days')::interval
           GROUP BY day, pipeline_name
           ORDER BY day DESC`,
          [days]
        );
        return Response.json({ trend: result.rows });
      }

      case "snapshot-history": {
        const result = await query(
          `SELECT
             time_bucket('1 day', snapshot_time) AS day,
             COUNT(*)::integer AS snapshots
           FROM pipeline_snapshots
           GROUP BY day
           ORDER BY day DESC
           LIMIT 30`
        );
        return Response.json({ history: result.rows });
      }

      case "pipeline-ledger": {
        // 1. Get current open pipeline total (respects pipeline + dealType filters)
        const balParams: (string | number | Date | string[])[] = [];
        const balConditions: string[] = [
          "stage_name NOT ILIKE '%closed%'",
          "stage_name NOT ILIKE '%renewed%'",
          "stage_name NOT ILIKE '%churn%'",
          "pipeline IS NOT NULL",
        ];
        const bpc = pipelineCondition(pipelineFilter, "pipeline", balParams);
        if (bpc) balConditions.push(bpc);
        const bdtc = dealTypeCondition(dealTypeFilter, "deal_type", balParams);
        if (bdtc) balConditions.push(bdtc);

        const balanceRes = await query(
          `SELECT COALESCE(SUM(amount), 0)::numeric as current_total
           FROM deals
           WHERE ${balConditions.join(" AND ")}`,
          balParams
        );
        const currentBalance = parseFloat(balanceRes.rows[0].current_total);

        // 1b. Quarter-scoped balance (deals with close_date in selected quarter)
        let quarterBalance: number | null = null;
        let quarterLabel: string | null = null;

        if (quarters.length > 0) {
          const qBalParams: (string | number | Date | string[])[] = [];
          const qBalConditions: string[] = [
            "stage_name NOT ILIKE '%closed%'",
            "stage_name NOT ILIKE '%renewed%'",
            "stage_name NOT ILIKE '%churn%'",
            "pipeline IS NOT NULL",
          ];
          const qbpc = pipelineCondition(pipelineFilter, "pipeline", qBalParams);
          if (qbpc) qBalConditions.push(qbpc);
          const qbdtc = dealTypeCondition(dealTypeFilter, "deal_type", qBalParams);
          if (qbdtc) qBalConditions.push(qbdtc);
          const qbqc = quarterCondition(quarters, "close_date", qBalParams);
          if (qbqc) qBalConditions.push(qbqc);

          const qBalRes = await query(
            `SELECT COALESCE(SUM(amount), 0)::numeric as quarter_total
             FROM deals
             WHERE ${qBalConditions.join(" AND ")}`,
            qBalParams
          );
          quarterBalance = parseFloat(qBalRes.rows[0].quarter_total);

          // Build quarter label from the quarter param
          const qParam = searchParams.get("quarter") || "";
          quarterLabel = qParam.split(",").map(q => {
            const m = q.trim().match(/^(\d{4})-Q([1-4])$/);
            return m ? `Q${m[2]} ${m[1]}` : q;
          }).join(", ");
        }

        // 2. Fetch quarter-impacting changelog events
        // When a quarter is selected, use UNION of 3 branches:
        //   A: amount/created/stage changes on deals with close_date IN the quarter
        //   B: close date moved INTO the quarter
        //   C: close date moved OUT OF the quarter
        // When no quarter selected, fall back to filtering on cl.changed_at

        const valueEventFilter = `(
          cl.property = 'amount'
          OR cl.property = 'created'
          OR (cl.property = 'dealstage' AND (
            cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%closed lost%'
            OR cl.new_label ILIKE '%renewed%' OR cl.new_label ILIKE '%churn%'
            OR cl.old_label ILIKE '%closed won%' OR cl.old_label ILIKE '%closed lost%'
            OR cl.old_label ILIKE '%renewed%' OR cl.old_label ILIKE '%churn%'
          ))
        )`;

        const selectCols = `cl.deal_id, cl.deal_name, cl.pipeline, cl.pipeline_name,
                 cl.property, cl.old_value, cl.new_value, cl.old_label, cl.new_label,
                 cl.changed_at, d.amount as current_amount`;
        const joinClause = `FROM deal_changelog cl LEFT JOIN deals d ON d.id = cl.deal_id`;

        let ledgerSql: string;
        let ledgerParams: (string | number | Date | string[])[] = [];
        let hiddenCount = 0;

        if (quarters.length > 0) {
          // Build shared pipeline + dealType filter fragments
          const sharedParams: (string | number | Date | string[])[] = [];
          const pFrag = pipelineCondition(pipelineFilter, "cl.pipeline", sharedParams);
          const dtFrag = dealTypeCondition(dealTypeFilter, "d.deal_type", sharedParams);
          const sharedWhere = [pFrag, dtFrag].filter(Boolean).join(" AND ");
          const sharedAnd = sharedWhere ? ` AND ${sharedWhere}` : "";

          // Quarter date ranges for parameterized queries
          // For simplicity with UNION, we build the quarter checks inline
          const qRanges = quarters.map(q => ({
            start: q.start.toISOString(),
            end: q.end.toISOString(),
          }));

          // Build quarter condition on a column using parameterized values
          const paramOffset = sharedParams.length;
          const qParams: string[] = [];
          const qCondParts: string[] = [];
          for (let qi = 0; qi < qRanges.length; qi++) {
            const startIdx = paramOffset + qi * 2 + 1;
            const endIdx = paramOffset + qi * 2 + 2;
            qParams.push(qRanges[qi].start, qRanges[qi].end);
            qCondParts.push(`(__COL__ >= $${startIdx} AND __COL__ < $${endIdx})`);
          }
          const qCondTemplate = qCondParts.length === 1 ? qCondParts[0] : `(${qCondParts.join(" OR ")})`;
          const notQCondTemplate = qCondParts.length === 1
            ? `(__COL__ < $${paramOffset + 1} OR __COL__ >= $${paramOffset + 2})`
            : `NOT ${qCondTemplate}`;

          // Replace __COL__ placeholder for each branch
          const closeDateInQ = qCondTemplate.replace(/__COL__/g, "d.close_date");
          const changedAtInQ = qCondTemplate.replace(/__COL__/g, "cl.changed_at");
          // Use NULLIF to safely handle empty strings before timestamptz cast
          const safeNewValue = "NULLIF(cl.new_value, '')::timestamptz";
          const safeOldValue = "NULLIF(cl.old_value, '')::timestamptz";
          const newValueInQ = qCondTemplate.replace(/__COL__/g, safeNewValue);
          const oldValueInQ = qCondTemplate.replace(/__COL__/g, safeOldValue);
          const newValueNotInQ = notQCondTemplate.replace(/__COL__/g, safeNewValue);
          const oldValueNotInQ = notQCondTemplate.replace(/__COL__/g, safeOldValue);
          const closeDateNotInQ = notQCondTemplate.replace(/__COL__/g, "d.close_date");

          ledgerParams = [...sharedParams, ...qParams];

          // Branch A: value events on deals with close_date in quarter
          const branchA = `SELECT ${selectCols} ${joinClause}
            WHERE ${valueEventFilter} AND ${closeDateInQ}${sharedAnd}`;

          // Branch B: close date moved INTO the quarter
          const branchB = `SELECT ${selectCols} ${joinClause}
            WHERE cl.property = 'closedate'
            AND ${newValueInQ}
            AND (cl.old_value IS NULL OR cl.old_value = '' OR ${oldValueNotInQ})${sharedAnd}`;

          // Branch C: close date moved OUT OF the quarter
          const branchC = `SELECT ${selectCols} ${joinClause}
            WHERE cl.property = 'closedate'
            AND ${oldValueInQ}
            AND (cl.new_value IS NULL OR cl.new_value = '' OR ${newValueNotInQ})${sharedAnd}`;

          ledgerSql = `(${branchA}) UNION ALL (${branchB}) UNION ALL (${branchC})
            ORDER BY changed_at DESC LIMIT 500`;

          // Hidden count: changes that happened during the quarter on deals closing outside it
          const hiddenSql = `SELECT COUNT(*)::integer as cnt ${joinClause}
            WHERE ${valueEventFilter} AND ${changedAtInQ}
            AND (d.close_date IS NULL OR ${closeDateNotInQ})${sharedAnd}`;

          const hiddenResult = await query(hiddenSql, ledgerParams);
          hiddenCount = hiddenResult.rows[0]?.cnt || 0;
        } else {
          // No quarter selected — use original behavior (filter on changed_at)
          const ledgerConditions: string[] = [valueEventFilter];
          const lpc = pipelineCondition(pipelineFilter, "cl.pipeline", ledgerParams);
          if (lpc) ledgerConditions.push(lpc);
          const ldtc = dealTypeCondition(dealTypeFilter, "d.deal_type", ledgerParams);
          if (ldtc) ledgerConditions.push(ldtc);

          ledgerSql = `SELECT ${selectCols} ${joinClause}
            WHERE ${ledgerConditions.join(" AND ")}
            ORDER BY cl.changed_at DESC LIMIT 500`;
        }

        const ledgerResult = await query(ledgerSql, ledgerParams);

        // 3. Compute deltas for each event
        const transactions: {
          dealId: string;
          dealName: string;
          pipelineName: string;
          type: string;
          delta: number;
          description: string;
          timestamp: string;
          timestampShort: string;
          balance: number;
        }[] = [];

        for (const r of ledgerResult.rows) {
          let delta = 0;
          let type = "amount_change";
          let description = "";

          if (r.property === "amount") {
            const oldAmt = parseFloat(r.old_value) || 0;
            const newAmt = parseFloat(r.new_value) || 0;
            delta = newAmt - oldAmt;
            type = "amount_change";
            description = `${r.old_label || "$0"} → ${r.new_label || "$0"}`;
          } else if (r.property === "created") {
            // new_value for created events is a stage ID, not an amount
            // Extract amount from new_label (e.g., "01 - Prospecting — $100,000") or use current_amount
            const labelAmountMatch = (r.new_label || "").match(/\$[\d,]+/);
            if (labelAmountMatch) {
              delta = parseFloat(labelAmountMatch[0].replace(/[$,]/g, "")) || 0;
            } else {
              delta = parseFloat(r.current_amount) || 0;
            }
            type = "deal_created";
            description = delta > 0 ? `New deal — ${r.new_label}` : "New deal — $0";
          } else if (r.property === "dealstage") {
            const newLower = (r.new_label || "").toLowerCase();
            const oldLower = (r.old_label || "").toLowerCase();
            const closedPatterns = ["closed won", "closed lost", "renewed", "churn"];
            const isClosingNow = closedPatterns.some(p => newLower.includes(p));
            const wasClosedBefore = closedPatterns.some(p => oldLower.includes(p));

            if (isClosingNow && !wasClosedBefore) {
              // Deal exiting pipeline
              const amt = parseFloat(r.current_amount) || 0;
              delta = -amt;
              const isWon = newLower.includes("closed won") || newLower.includes("renewed");
              type = isWon ? "closed_won" : "closed_lost";
              description = `${r.old_label} → ${r.new_label}`;
            } else if (wasClosedBefore && !isClosingNow) {
              // Deal re-entering pipeline
              const amt = parseFloat(r.current_amount) || 0;
              delta = amt;
              type = "reopened";
              description = `${r.old_label} → ${r.new_label}`;
            } else {
              // Both old and new are closed — no net pipeline impact
              continue;
            }
          } else if (r.property === "closedate") {
            // Close date moved into or out of the selected quarter
            const amt = parseFloat(r.current_amount) || 0;
            const newDate = r.new_value ? new Date(r.new_value) : null;
            const oldDate = r.old_value ? new Date(r.old_value) : null;
            const newInQ = newDate && quarters.some(q => newDate >= q.start && newDate < q.end);
            const oldInQ = oldDate && quarters.some(q => oldDate >= q.start && oldDate < q.end);

            if (newInQ && !oldInQ) {
              delta = amt;
              type = "date_moved_in";
              description = `Close date → ${r.new_label || r.new_value} (entered quarter)`;
            } else if (oldInQ && !newInQ) {
              delta = -amt;
              type = "date_moved_out";
              description = `Close date ${r.old_label || r.old_value} → ${r.new_label || r.new_value} (left quarter)`;
            } else {
              continue; // Both in or both out — shouldn't happen due to UNION logic
            }
          }

          const dt = new Date(r.changed_at);
          const timestamp = dt.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }) + ", " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          const timestampShort = `${dt.getMonth() + 1}-${dt.getDate()}-${String(dt.getFullYear()).slice(2)}`;

          transactions.push({
            dealId: r.deal_id,
            dealName: r.deal_name,
            pipelineName: r.pipeline_name,
            type,
            delta,
            description,
            timestamp,
            timestampShort,
            balance: 0, // computed below
          });
        }

        // 4. Compute running balance per transaction
        // Anchor to quarter balance when filtered, otherwise all-time
        let runningBalance = quarterBalance ?? currentBalance;

        for (let i = 0; i < transactions.length; i++) {
          transactions[i].balance = runningBalance;
          runningBalance -= transactions[i].delta;
        }

        return Response.json({ currentBalance, quarterBalance, quarterLabel, transactions, hiddenCount });
      }

      default:
        return Response.json({ error: "Unknown type" }, { status: 400 });
    }
  } catch (error) {
    console.error("API error:", error);
    return Response.json(
      { error: "Database query failed. Has the sync been run?" },
      { status: 500 }
    );
  }
}
