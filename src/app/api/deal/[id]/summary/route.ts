import { query } from "@/lib/db";
import { generateDealSummary, parseStructuredSummary } from "@/lib/claude";

export const dynamic = "force-dynamic";

async function getCached(dealId: string): Promise<{ summary_text: string; based_on_changed_at: string | null; model: string | null; generated_at: string } | null> {
  const res = await query(
    `SELECT summary_text, based_on_changed_at, model, generated_at
     FROM deal_ai_summaries WHERE deal_id = $1`,
    [dealId]
  );
  return res.rows[0] || null;
}

async function getNewestChange(dealId: string): Promise<string | null> {
  const res = await query(
    `SELECT MAX(changed_at) as newest FROM deal_changelog WHERE deal_id = $1`,
    [dealId]
  );
  return res.rows[0]?.newest || null;
}

async function upsertSummary(
  dealId: string,
  text: string,
  basedOn: string | null,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Promise<string> {
  const res = await query(
    `INSERT INTO deal_ai_summaries (deal_id, summary_text, based_on_changed_at, model, generated_at, input_tokens, output_tokens)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6)
     ON CONFLICT (deal_id) DO UPDATE
       SET summary_text = EXCLUDED.summary_text,
           based_on_changed_at = EXCLUDED.based_on_changed_at,
           model = EXCLUDED.model,
           generated_at = NOW(),
           input_tokens = EXCLUDED.input_tokens,
           output_tokens = EXCLUDED.output_tokens
     RETURNING generated_at`,
    [dealId, text, basedOn, model, inputTokens, outputTokens]
  );
  return res.rows[0].generated_at;
}

async function handle(dealId: string, forceRefresh: boolean) {
  if (!dealId) return Response.json({ error: "Missing deal id" }, { status: 400 });

  const newest = await getNewestChange(dealId);

  if (!forceRefresh) {
    const cached = await getCached(dealId);
    if (cached) {
      const cacheValid = (!newest && !cached.based_on_changed_at)
        || (newest && cached.based_on_changed_at && new Date(cached.based_on_changed_at).getTime() === new Date(newest).getTime());
      if (cacheValid) {
        return Response.json({
          summary: cached.summary_text,
          parsed: parseStructuredSummary(cached.summary_text),
          cached: true,
          model: cached.model,
          generatedAt: cached.generated_at,
        });
      }
    }
  }

  // Generate fresh
  try {
    const { text, model, inputTokens, outputTokens } = await generateDealSummary(dealId);
    const generatedAt = await upsertSummary(dealId, text, newest, model, inputTokens, outputTokens);
    return Response.json({
      summary: text,
      parsed: parseStructuredSummary(text),
      cached: false,
      model,
      generatedAt,
    });
  } catch (error) {
    console.error("Summary generation failed:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({
      summary: null,
      parsed: null,
      cached: false,
      error: msg,
    }, { status: 500 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(id, false);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(id, true);
}
