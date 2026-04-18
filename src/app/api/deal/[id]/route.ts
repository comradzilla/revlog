import { query } from "@/lib/db";
import { buildHealthCte, breakdownFor, type HealthSignals } from "@/lib/health";
import { getHealthWeights } from "@/lib/settings";
import { isStageRegression } from "@/lib/query-helpers";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return Response.json({ error: "Missing deal id" }, { status: 400 });

  try {
    const weights = await getHealthWeights();

    const dealResult = await query(
      `${buildHealthCte(weights)}
       SELECT d.id, d.deal_name, d.pipeline, d.pipeline_name, d.deal_stage, d.stage_name,
              d.amount, d.close_date, d.created_at, d.updated_at, d.stage_entered_at,
              d.deal_type, d.next_step,
              COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
              h.health_score, h.regression_count, h.slip_count, h.amount_net,
              h.next_step_last_update
       FROM deals d
       LEFT JOIN owners o ON o.id = d.owner_id
       LEFT JOIN deal_health h ON h.deal_id = d.id
       WHERE d.id = $1`,
      [id]
    );

    if (dealResult.rows.length === 0) {
      return Response.json({ error: "Deal not found" }, { status: 404 });
    }
    const r = dealResult.rows[0];
    const score = r.health_score === null ? null : parseInt(String(r.health_score));
    const signals: HealthSignals = {
      health_score: score,
      regression_count: parseInt(String(r.regression_count ?? 0)),
      slip_count: parseInt(String(r.slip_count ?? 0)),
      amount_net: parseFloat(String(r.amount_net ?? 0)),
      next_step_last_update: r.next_step_last_update,
      stage_entered_at: r.stage_entered_at,
      stage_name: r.stage_name,
      next_step: r.next_step,
    };
    const breakdown = breakdownFor(signals, weights);

    // Full changelog for this deal, most recent first
    const logResult = await query(
      `SELECT cl.property, cl.property_label, cl.old_value, cl.new_value,
              cl.old_label, cl.new_label, cl.changed_at, cl.source_type
       FROM deal_changelog cl
       WHERE cl.deal_id = $1
       ORDER BY cl.changed_at DESC
       LIMIT 500`,
      [id]
    );

    const timeline = logResult.rows.map((row: Record<string, string>) => {
      const isStage = row.property === "dealstage";
      return {
        property: row.property,
        propertyLabel: row.property_label,
        oldValue: row.old_value,
        newValue: row.new_value,
        oldLabel: row.old_label,
        newLabel: row.new_label,
        timestamp: row.changed_at,
        sourceType: row.source_type,
        isRegression: isStage ? isStageRegression(row.old_label || "", row.new_label || "") : false,
      };
    });

    return Response.json({
      deal: {
        id: r.id,
        dealName: r.deal_name,
        pipeline: r.pipeline,
        pipelineName: r.pipeline_name,
        dealStage: r.deal_stage,
        stageName: r.stage_name,
        amount: parseFloat(String(r.amount || "0")),
        closeDate: r.close_date,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        stageEnteredAt: r.stage_entered_at,
        dealType: r.deal_type,
        nextStep: r.next_step,
        ownerName: r.owner_name,
      },
      health: {
        score: breakdown.score,
        bucket: breakdown.bucket,
        penalties: breakdown.penalties,
        signals: {
          regression_count: signals.regression_count,
          slip_count: signals.slip_count,
          amount_net: signals.amount_net,
        },
      },
      timeline,
    });
  } catch (error) {
    console.error("GET /api/deal/[id] error:", error);
    return Response.json({ error: "Database query failed" }, { status: 500 });
  }
}
