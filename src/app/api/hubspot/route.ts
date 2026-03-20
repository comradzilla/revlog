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

  try {
    switch (type) {
      case "changelog": {
        const limit = parseInt(searchParams.get("limit") || "200");
        let sql = `SELECT deal_id, deal_name, pipeline, pipeline_name, property,
                  property_label, old_value, new_value, old_label, new_label,
                  changed_at as timestamp, source_type
           FROM deal_changelog`;
        const params: (string | number | Date)[] = [];

        if (quarterRange) {
          params.push(quarterRange.start.toISOString(), quarterRange.end.toISOString());
          sql += ` WHERE changed_at >= $1 AND changed_at < $2`;
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
        let sql = `SELECT DISTINCT ON (d.id)
                    d.id, d.deal_name, d.pipeline_name, d.stage_name as current_stage_name,
                    d.amount, cl.changed_at as last_modified, cl.property as change_type,
                    COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name
                  FROM deals d
                  INNER JOIN deal_changelog cl ON cl.deal_id = d.id
                  LEFT JOIN owners o ON o.id = d.owner_id`;
        const params: (string | number | Date)[] = [];

        if (quarterRange) {
          params.push(quarterRange.start.toISOString(), quarterRange.end.toISOString());
          sql += ` WHERE cl.changed_at >= $1 AND cl.changed_at < $2`;
        }

        sql += ` ORDER BY d.id, cl.changed_at DESC`;

        // Wrap to re-sort and limit
        const wrappedSql = `SELECT * FROM (${sql}) sub ORDER BY last_modified DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const result = await query(wrappedSql, params);
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
        // Open pipeline value across Growth + Renewal + Partner Leads + VS pipelines
        const openStages = [
          // Growth
          "1166852615", "1166852616", "1166852617", "1166852618", "1166852619",
          // Renewal
          "15424275", "15424273", "56953899", "15424276",
          // Renewal alt
          "1312718091", "1312718097", "1312718092", "1312718093", "1312718094",
          // Partner Leads
          "224212800", "224212801", "224212802", "227590167",
          // VS Sales
          "1312827533", "1312827535", "1312827528", "1312827529", "1312827530",
        ];
        const result = await query(
          `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
           FROM deals
           WHERE deal_stage = ANY($1)`,
          [openStages]
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
        let sql = `SELECT COUNT(*)::integer as count, COALESCE(SUM(amount), 0)::numeric as total_value
                   FROM deals
                   WHERE stage_name ILIKE '%closed won%' OR stage_name ILIKE '%renewed%'`;
        const params: (string | Date)[] = [];

        if (quarterRange) {
          params.push(quarterRange.start.toISOString(), quarterRange.end.toISOString());
          sql += ` AND updated_at >= $1 AND updated_at < $2`;
        } else {
          // Default: current month
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          params.push(monthStart.toISOString());
          sql += ` AND updated_at >= $1`;
        }

        const result = await query(sql, params);
        const row = result.rows[0];
        return Response.json({
          totalValue: parseFloat(row.total_value),
          count: row.count,
        });
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
