import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

const UPSELL_TYPES = ["existingbusiness", "existing_business"];
const NEW_BIZ_TYPES = ["newbusiness", "new_business"];

// Stage weights for weighted pipeline (mirrors hubspot.ts)
const STAGE_WEIGHT_MAP: Record<string, number> = {
  "1166852615": 0.10, "1166852616": 0.25, "1166852617": 0.50,
  "1166852618": 0.70, "1166852619": 0.90,
  "1312827533": 0.10, "1312827535": 0.25, "1312827528": 0.50,
  "1312827529": 0.70, "1312827530": 0.90,
  "224212800": 0.10, "224212801": 0.25, "224212802": 0.50, "227590167": 0.70,
};

function parseQuarters(q: string | null): { start: Date; end: Date }[] {
  if (!q) return [];
  return q.split(",").map(part => {
    const match = part.trim().match(/^(\d{4})-Q([1-4])$/);
    if (!match) return null;
    const year = parseInt(match[1]);
    const quarter = parseInt(match[2]);
    const startMonth = (quarter - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 1),
    };
  }).filter(Boolean) as { start: Date; end: Date }[];
}

function quarterCondition(
  quarters: { start: Date; end: Date }[],
  column: string,
  params: (string | number | Date | string[])[]
): string {
  if (quarters.length === 0) return "";
  if (quarters.length === 1) {
    params.push(quarters[0].start.toISOString(), quarters[0].end.toISOString());
    return `${column} >= $${params.length - 1} AND ${column} < $${params.length}`;
  }
  const parts = quarters.map(q => {
    params.push(q.start.toISOString(), q.end.toISOString());
    return `(${column} >= $${params.length - 1} AND ${column} < $${params.length})`;
  });
  return `(${parts.join(" OR ")})`;
}

function dealTypeCondition(
  dtFilter: string | null,
  column: string,
  params: (string | number | Date | string[])[]
): string {
  if (!dtFilter || dtFilter === "all") return "";
  if (dtFilter === "upsell") {
    params.push(UPSELL_TYPES);
    return `${column} = ANY($${params.length})`;
  }
  if (dtFilter === "newbusiness") {
    params.push(NEW_BIZ_TYPES);
    return `${column} = ANY($${params.length})`;
  }
  params.push(dtFilter);
  return `${column} = $${params.length}`;
}

function pipelineCondition(
  pFilter: string | null,
  column: string,
  params: (string | number | Date | string[])[]
): string {
  if (!pFilter || pFilter === "all") return "";
  const ids = pFilter.split(",").map(s => s.trim()).filter(Boolean);
  if (ids.length === 0) return "";
  if (ids.length === 1) {
    params.push(ids[0]);
    return `${column} = $${params.length}`;
  }
  params.push(ids);
  return `${column} = ANY($${params.length})`;
}

// Detect stage regression from label prefixes (e.g., "05 - Negotiation" → "02 - Qualification")
function isStageRegression(oldLabel: string, newLabel: string): boolean {
  const oldMatch = oldLabel.match(/^(\d+)/);
  const newMatch = newLabel.match(/^(\d+)/);
  if (!oldMatch || !newMatch) return false;
  const oldNum = parseInt(oldMatch[1]);
  const newNum = parseInt(newMatch[1]);
  // Stage 0 = Closed Lost, don't count as regression
  if (newNum === 0) return false;
  return newNum < oldNum;
}

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

        const sql = `
          SELECT * FROM (
            SELECT DISTINCT ON (d.id)
              d.id, d.deal_name, d.pipeline_name, d.stage_name as current_stage_name,
              d.amount, cl.changed_at as last_modified, cl.property as change_type,
              d.deal_type, d.stage_entered_at,
              COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name
            FROM deals d
            INNER JOIN deal_changelog cl ON cl.deal_id = d.id
            LEFT JOIN owners o ON o.id = d.owner_id
            ${whereClause}
            ORDER BY d.id, cl.changed_at DESC
          ) sub
          ORDER BY last_modified DESC
          LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        const deals = result.rows.map((r: Record<string, string>) => ({
          id: r.id,
          dealName: r.deal_name,
          pipelineName: r.pipeline_name,
          currentStageName: r.current_stage_name,
          stageNumber: 0,
          amount: parseFloat(r.amount || "0"),
          lastModified: r.last_modified,
          ownerName: r.owner_name,
          changeType: r.change_type,
          dealType: r.deal_type,
          stageEnteredAt: r.stage_entered_at,
        }));
        return Response.json({ deals });
      }

      case "pipeline-stats": {
        const pipelineId = searchParams.get("pipeline") || "4207989";
        const result = await query(
          `SELECT deal_stage as "stageId", stage_name as label,
                  COUNT(*)::integer as count,
                  COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE pipeline = $1
           GROUP BY deal_stage, stage_name
           ORDER BY stage_name`,
          [pipelineId]
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
        const result = await query(
          `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE stage_name NOT ILIKE '%closed%'
             AND stage_name NOT ILIKE '%renewed%'
             AND stage_name NOT ILIKE '%churn%'
             AND pipeline IS NOT NULL`
        );
        const row = result.rows[0];
        return Response.json({
          totalValue: parseFloat(row.total_value),
          count: row.count,
        });
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

      case "stale-deals": {
        const result = await query(
          `SELECT d.id, d.deal_name, d.amount, d.stage_name, d.pipeline_name,
                  COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
                  MAX(cl.changed_at) as last_activity,
                  EXTRACT(DAY FROM NOW() - MAX(cl.changed_at))::integer as days_stale
           FROM deals d
           LEFT JOIN deal_changelog cl ON cl.deal_id = d.id AND cl.property IN ('dealstage', 'amount')
           LEFT JOIN owners o ON o.id = d.owner_id
           WHERE (d.stage_name ILIKE '%proposal%' OR d.stage_name ILIKE '%negotiat%'
                  OR d.stage_name ILIKE '%propose%' OR d.stage_name ILIKE '%negotiate%'
                  OR d.stage_name ILIKE '%solutioning%' OR d.stage_name ILIKE '%qualification%')
             AND d.stage_name NOT ILIKE '%closed%'
           GROUP BY d.id, d.deal_name, d.amount, d.stage_name, d.pipeline_name, o.first_name, o.last_name
           HAVING MAX(cl.changed_at) < NOW() - INTERVAL '30 days' OR MAX(cl.changed_at) IS NULL
           ORDER BY d.amount DESC NULLS LAST
           LIMIT 20`
        );

        const deals = result.rows.map((r: Record<string, string>) => ({
          id: r.id,
          dealName: r.deal_name,
          amount: parseFloat(r.amount || "0"),
          stageName: r.stage_name,
          pipelineName: r.pipeline_name,
          ownerName: r.owner_name,
          lastActivity: r.last_activity,
          daysStale: parseInt(r.days_stale) || 999,
        }));

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

        // 2. Fetch all value-affecting changelog events
        const ledgerParams: (string | number | Date | string[])[] = [];
        const ledgerConditions: string[] = [];

        // Only value-affecting events:
        // - amount changes
        // - deal created (enters pipeline with value)
        // - stage change TO a closed stage (exits pipeline)
        // - stage change FROM a closed stage (re-enters pipeline)
        ledgerConditions.push(`(
          cl.property = 'amount'
          OR cl.property = 'created'
          OR (cl.property = 'dealstage' AND (
            cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%closed lost%'
            OR cl.new_label ILIKE '%renewed%' OR cl.new_label ILIKE '%churn%'
            OR cl.old_label ILIKE '%closed won%' OR cl.old_label ILIKE '%closed lost%'
            OR cl.old_label ILIKE '%renewed%' OR cl.old_label ILIKE '%churn%'
          ))
        )`);

        const lqc = quarterCondition(quarters, "cl.changed_at", ledgerParams);
        if (lqc) ledgerConditions.push(lqc);

        const lpc = pipelineCondition(pipelineFilter, "cl.pipeline", ledgerParams);
        if (lpc) ledgerConditions.push(lpc);

        const ldtc = dealTypeCondition(dealTypeFilter, "d.deal_type", ledgerParams);
        if (ldtc) ledgerConditions.push(ldtc);

        const ledgerSql = `
          SELECT cl.deal_id, cl.deal_name, cl.pipeline, cl.pipeline_name,
                 cl.property, cl.old_value, cl.new_value, cl.old_label, cl.new_label,
                 cl.changed_at, d.amount as current_amount
          FROM deal_changelog cl
          LEFT JOIN deals d ON d.id = cl.deal_id
          WHERE ${ledgerConditions.join(" AND ")}
          ORDER BY cl.changed_at DESC
          LIMIT 500`;

        const ledgerResult = await query(ledgerSql, ledgerParams);

        // 3. Compute deltas and group by day
        interface LedgerTxn {
          dealId: string;
          dealName: string;
          pipelineName: string;
          type: string;
          delta: number;
          description: string;
          timestamp: string;
        }

        const dayMap = new Map<string, { dateLabel: string; transactions: LedgerTxn[] }>();

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
          }

          const dt = new Date(r.changed_at);
          const dateKey = dt.toISOString().split("T")[0];
          const dateLabel = dt.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }).toUpperCase().replace(",", "");

          if (!dayMap.has(dateKey)) {
            dayMap.set(dateKey, { dateLabel, transactions: [] });
          }

          dayMap.get(dateKey)!.transactions.push({
            dealId: r.deal_id,
            dealName: r.deal_name,
            pipelineName: r.pipeline_name,
            type,
            delta,
            description,
            timestamp: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
          });
        }

        // 4. Compute running balance (newest day = currentBalance, work backward)
        const sortedDates = Array.from(dayMap.keys()).sort((a, b) => b.localeCompare(a));
        let runningBalance = currentBalance;

        const days = sortedDates.map((dateKey, i) => {
          const day = dayMap.get(dateKey)!;
          const dailyNet = day.transactions.reduce((sum, t) => sum + t.delta, 0);
          const endOfDayBalance = i === 0 ? runningBalance : runningBalance;

          if (i > 0) {
            // This day's end-of-day balance was already set above
          }

          const result = {
            date: dateKey,
            dateLabel: day.dateLabel,
            dailyNet,
            endOfDayBalance: runningBalance,
            transactionCount: day.transactions.length,
            transactions: day.transactions,
          };

          // Subtract this day's net to get the previous day's end-of-day balance
          runningBalance -= dailyNet;

          return result;
        });

        return Response.json({ currentBalance, quarterBalance, quarterLabel, days });
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
