import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Normalize deal type values from HubSpot
const UPSELL_TYPES = ["existingbusiness", "existing_business"];
const NEW_BIZ_TYPES = ["newbusiness", "new_business"];

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

// Build deal type SQL condition
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
        // If filtering by deal type, need to join deals table
        const needsDealJoin = dealTypeFilter && dealTypeFilter !== "all";

        let sql = needsDealJoin
          ? `SELECT cl.deal_id, cl.deal_name, cl.pipeline, cl.pipeline_name, cl.property,
                    cl.property_label, cl.old_value, cl.new_value, cl.old_label, cl.new_label,
                    cl.changed_at as timestamp, cl.source_type
             FROM deal_changelog cl
             JOIN deals d ON d.id = cl.deal_id`
          : `SELECT deal_id, deal_name, pipeline, pipeline_name, property,
                    property_label, old_value, new_value, old_label, new_label,
                    changed_at as timestamp, source_type
             FROM deal_changelog`;

        const colPrefix = needsDealJoin ? "cl." : "";

        const qc = quarterCondition(quarters, `${colPrefix}changed_at`, params);
        if (qc) conditions.push(qc);

        if (pipelineFilter && pipelineFilter !== "all") {
          params.push(pipelineFilter);
          conditions.push(`${colPrefix}pipeline = $${params.length}`);
        }

        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(" AND ")}`;
        }

        sql += ` ORDER BY ${colPrefix}changed_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(sql, params);
        const changelogs = result.rows.map((r: Record<string, string>) => ({
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
        }));
        return Response.json({ changelogs });
      }

      case "recently-changed": {
        const limit = parseInt(searchParams.get("limit") || "15");
        const params: (string | number | Date | string[])[] = [];
        const conditions: string[] = [];

        const qc = quarterCondition(quarters, "cl.changed_at", params);
        if (qc) conditions.push(qc);

        if (pipelineFilter && pipelineFilter !== "all") {
          params.push(pipelineFilter);
          conditions.push(`cl.pipeline = $${params.length}`);
        }

        const dtc = dealTypeCondition(dealTypeFilter, "d.deal_type", params);
        if (dtc) conditions.push(dtc);

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

        const sql = `
          SELECT * FROM (
            SELECT DISTINCT ON (d.id)
              d.id, d.deal_name, d.pipeline_name, d.stage_name as current_stage_name,
              d.amount, cl.changed_at as last_modified, cl.property as change_type,
              d.deal_type,
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
        // Upsell/expansion breakdown by stage (across all pipelines)
        const dtParam = searchParams.get("dealType") || "upsell";
        const types = dtParam === "upsell" ? UPSELL_TYPES : NEW_BIZ_TYPES;

        const result = await query(
          `SELECT stage_name as label, deal_stage as "stageId",
                  COUNT(*)::integer as count,
                  COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE deal_type = ANY($1)
             AND stage_name NOT ILIKE '%closed lost%'
             AND stage_name NOT ILIKE '%churn%'
           GROUP BY deal_stage, stage_name
           ORDER BY stage_name`,
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
        return Response.json({ stats, totalCount, totalValue });
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
