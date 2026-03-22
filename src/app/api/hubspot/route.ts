import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Parse quarter param like "2025-Q1" into start/end dates
function parseQuarter(q: string | null): { start: Date; end: Date } | null {
  if (!q) return null;
  const match = q.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const quarter = parseInt(match[2]);
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, startMonth + 3, 1),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") || "changelog";
  const quarterRange = parseQuarter(searchParams.get("quarter"));
  const pipelineFilter = searchParams.get("pipeline");

  try {
    switch (type) {
      case "changelog": {
        const limit = parseInt(searchParams.get("limit") || "200");
        let sql = `SELECT deal_id, deal_name, pipeline, pipeline_name, property,
                  property_label, old_value, new_value, old_label, new_label,
                  changed_at as timestamp, source_type
           FROM deal_changelog`;
        const params: (string | number | Date)[] = [];
        const conditions: string[] = [];

        if (quarterRange) {
          params.push(quarterRange.start.toISOString(), quarterRange.end.toISOString());
          conditions.push(`changed_at >= $${params.length - 1} AND changed_at < $${params.length}`);
        }

        if (pipelineFilter && pipelineFilter !== "all") {
          params.push(pipelineFilter);
          conditions.push(`pipeline = $${params.length}`);
        }

        if (conditions.length > 0) {
          sql += ` WHERE ${conditions.join(" AND ")}`;
        }

        sql += ` ORDER BY changed_at DESC LIMIT $${params.length + 1}`;
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
        // Only deals with actual stage or amount changes, ordered by most recent change
        const limit = parseInt(searchParams.get("limit") || "15");
        const params: (string | number | Date)[] = [];
        const conditions: string[] = [];

        if (quarterRange) {
          params.push(quarterRange.start.toISOString(), quarterRange.end.toISOString());
          conditions.push(`cl.changed_at >= $${params.length - 1} AND cl.changed_at < $${params.length}`);
        }

        if (pipelineFilter && pipelineFilter !== "all") {
          params.push(pipelineFilter);
          conditions.push(`cl.pipeline = $${params.length}`);
        }

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
          `SELECT deal_stage as "stageId", stage_name as label, COUNT(*)::integer as count
           FROM deals
           WHERE pipeline = $1
           GROUP BY deal_stage, stage_name
           ORDER BY stage_name`,
          [pipelineId]
        );
        return Response.json({ stats: result.rows });
      }

      case "pipeline-value": {
        // Open pipeline value — exclude closed won/lost stages
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
        // Return all pipelines with deal counts
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
        // Closed Won value with quarter filtering
        // Use changelog to find deals that moved to closed won within the quarter
        if (quarterRange) {
          const result = await query(
            `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                    COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
             FROM deal_changelog cl
             JOIN deals d ON d.id = cl.deal_id
             WHERE cl.property = 'dealstage'
               AND (cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%renewed%')
               AND cl.changed_at >= $1 AND cl.changed_at < $2`,
            [quarterRange.start.toISOString(), quarterRange.end.toISOString()]
          );
          const row = result.rows[0];
          return Response.json({
            totalValue: parseFloat(row.total_value),
            count: row.count,
          });
        } else {
          // Default: current month
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const result = await query(
            `SELECT COUNT(DISTINCT cl.deal_id)::integer as count,
                    COALESCE(SUM(DISTINCT d.amount), 0)::numeric as total_value
             FROM deal_changelog cl
             JOIN deals d ON d.id = cl.deal_id
             WHERE cl.property = 'dealstage'
               AND (cl.new_label ILIKE '%closed won%' OR cl.new_label ILIKE '%renewed%')
               AND cl.changed_at >= $1`,
            [monthStart.toISOString()]
          );
          const row = result.rows[0];
          return Response.json({
            totalValue: parseFloat(row.total_value),
            count: row.count,
          });
        }
      }

      case "deal-types": {
        // Return distinct deal types
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
        // Return snapshot counts for tracking
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
