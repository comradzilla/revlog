import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// Haiku 4.5 pricing (per 1M tokens). Update if model changes.
const PRICING_PER_M_TOKENS: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5":          { in: 1.0, out: 5.0 },
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-6":         { in: 3.0, out: 15.0 },
};

const MONTHLY_BUDGET_USD = 10;

export async function GET() {
  try {
    // This-month and last-7d rollups, excluding canned (closed-deal) summaries.
    const monthRes = await query(
      `SELECT COALESCE(SUM(input_tokens), 0)::int  AS in_tok,
              COALESCE(SUM(output_tokens), 0)::int AS out_tok,
              COUNT(*) FILTER (WHERE model <> 'canned')::int AS api_calls,
              COUNT(*) FILTER (WHERE model =  'canned')::int AS canned_calls,
              COALESCE(MAX(model), 'claude-haiku-4-5') AS model
       FROM deal_ai_summaries
       WHERE generated_at >= date_trunc('month', NOW())
         AND model <> 'canned'`
    );
    const r = monthRes.rows[0];
    const model = r.model || "claude-haiku-4-5";
    const pricing = PRICING_PER_M_TOKENS[model] || PRICING_PER_M_TOKENS["claude-haiku-4-5"];

    const inTok = Number(r.in_tok) || 0;
    const outTok = Number(r.out_tok) || 0;
    const usdThisMonth = (inTok * pricing.in + outTok * pricing.out) / 1_000_000;

    // Canned-call count is shown separately so the user can see "tokens saved by skipping closed deals"
    const cannedRes = await query(
      `SELECT COUNT(*)::int AS canned_calls
       FROM deal_ai_summaries
       WHERE generated_at >= date_trunc('month', NOW())
         AND model = 'canned'`
    );
    const cannedCalls = Number(cannedRes.rows[0]?.canned_calls) || 0;

    return Response.json({
      monthlyBudgetUsd: MONTHLY_BUDGET_USD,
      usdThisMonth,
      apiCallsThisMonth: Number(r.api_calls) || 0,
      cannedCallsThisMonth: cannedCalls,
      inputTokensThisMonth: inTok,
      outputTokensThisMonth: outTok,
      model,
      pricing,
    });
  } catch (error) {
    console.error("GET /api/ai-spend error:", error);
    return Response.json({ error: "Failed to load spend" }, { status: 500 });
  }
}
