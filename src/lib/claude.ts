import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { breakdownFor, type HealthSignals } from "@/lib/health";
import { getHealthWeights } from "@/lib/settings";

// Using Haiku 4.5 — CEO skims many deals per session; latency/cost matter more
// than deep analysis. Swap to claude-sonnet-4-6 if summaries feel thin.
const DEFAULT_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a B2B sales pipeline analyst writing a terse read-out for a CEO who will skim dozens of deals per sitting.

Output exactly three sections, in this order, with no preamble, no markdown headers, and no surrounding prose:

RISK: <one of: AT RISK | WATCH | HEALTHY>
Why:
- <signal 1 with a date or number — one sentence>
- <signal 2 — one sentence>
- <signal 3 if applicable — omit the bullet if not>
Next: <one sentence recommending what the deal owner should do next>

Rules:
- The RISK label must be consistent with the health score provided. Score < 50 → AT RISK. Score 50-79 → WATCH. Score ≥ 80 → HEALTHY.
- Draw Why bullets from the health penalty breakdown and the recent timeline. Do not invent signals.
- If the deal is already closed (won or lost/churn), set RISK to HEALTHY for won, AT RISK for lost, keep the Why bullets descriptive of what happened, and for Next say "No action — closed."
- Keep each line short enough to read in one glance. No hedging ("might", "could be").`;

interface DealRow {
  id: string;
  deal_name: string;
  pipeline_name: string;
  stage_name: string;
  amount: string;
  close_date: string | null;
  created_at: string;
  stage_entered_at: string | null;
  deal_type: string | null;
  next_step: string | null;
  owner_name: string;
  health_score: number | null;
  regression_count: number;
  slip_count: number;
  amount_net: string;
  next_step_last_update: string | null;
}

interface TimelineRow {
  property: string;
  old_label: string | null;
  new_label: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
}

async function loadDealForPrompt(dealId: string): Promise<{ deal: DealRow; timeline: TimelineRow[] } | null> {
  const weights = await getHealthWeights();
  const { buildHealthCte } = await import("@/lib/health");

  const dealRes = await query(
    `${buildHealthCte(weights)}
     SELECT d.id, d.deal_name, d.pipeline_name, d.stage_name, d.amount,
            d.close_date, d.created_at, d.stage_entered_at, d.deal_type, d.next_step,
            COALESCE(o.first_name || ' ' || o.last_name, 'Unassigned') as owner_name,
            h.health_score, h.regression_count, h.slip_count, h.amount_net, h.next_step_last_update
     FROM deals d
     LEFT JOIN owners o ON o.id = d.owner_id
     LEFT JOIN deal_health h ON h.deal_id = d.id
     WHERE d.id = $1`,
    [dealId]
  );
  if (dealRes.rows.length === 0) return null;

  const timelineRes = await query(
    `SELECT property, old_label, new_label, old_value, new_value, changed_at
     FROM deal_changelog
     WHERE deal_id = $1
     ORDER BY changed_at DESC
     LIMIT 10`,
    [dealId]
  );

  return { deal: dealRes.rows[0] as DealRow, timeline: timelineRes.rows as TimelineRow[] };
}

function buildUserMessage(deal: DealRow, timeline: TimelineRow[], penaltyLines: string): string {
  const lines: string[] = [];
  lines.push(`Deal: ${deal.deal_name}`);
  lines.push(`Pipeline: ${deal.pipeline_name}`);
  lines.push(`Stage: ${deal.stage_name}`);
  lines.push(`Amount: $${Number(deal.amount || 0).toLocaleString()}`);
  lines.push(`Owner: ${deal.owner_name}`);
  lines.push(`Close date: ${deal.close_date ? new Date(deal.close_date).toLocaleDateString() : "—"}`);
  lines.push(`Created: ${new Date(deal.created_at).toLocaleDateString()}`);
  lines.push(`Next step: ${deal.next_step || "(none set)"}`);
  lines.push("");
  lines.push(`Health score: ${deal.health_score ?? "NULL (closed)"} / 100`);
  lines.push(penaltyLines);
  lines.push("");
  lines.push("Recent activity (newest first):");
  if (timeline.length === 0) {
    lines.push("- (no activity recorded)");
  } else {
    for (const ev of timeline) {
      const when = new Date(ev.changed_at).toLocaleDateString();
      if (ev.property === "dealstage") {
        lines.push(`- ${when}: stage ${ev.old_label || "?"} → ${ev.new_label || "?"}`);
      } else if (ev.property === "amount") {
        const oldAmt = parseFloat(String(ev.old_value || 0));
        const newAmt = parseFloat(String(ev.new_value || 0));
        const delta = newAmt - oldAmt;
        lines.push(`- ${when}: amount $${oldAmt.toLocaleString()} → $${newAmt.toLocaleString()} (${delta >= 0 ? "+" : ""}$${delta.toLocaleString()})`);
      } else if (ev.property === "closedate") {
        lines.push(`- ${when}: close date ${ev.old_label || ev.old_value || "?"} → ${ev.new_label || ev.new_value || "?"}`);
      } else if (ev.property === "created") {
        lines.push(`- ${when}: deal created at ${ev.new_label || ev.new_value || "?"}`);
      } else if (ev.property === "hs_next_step") {
        lines.push(`- ${when}: next step updated`);
      } else {
        lines.push(`- ${when}: ${ev.property} changed`);
      }
    }
  }

  return lines.join("\n");
}

export interface SummaryResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Closed-deal short-circuit. Closed deals are terminal — their changelog won't
// gain new entries, so a Claude-generated narrative would burn tokens to tell
// the CEO what they already see in the stage name. We return a canned, parseable
// 3-section summary instead, marked with model="canned" so spend dashboards
// can exclude it from the API-cost rollup.
function cannedClosedSummary(deal: DealRow): SummaryResult {
  const stageLower = (deal.stage_name || "").toLowerCase();
  const isWon = stageLower.includes("closed won") || stageLower.includes("renewed");
  const risk = isWon ? "HEALTHY" : "AT RISK";
  const verb = isWon ? "won" : "lost";
  const amountStr = `$${Number(deal.amount || 0).toLocaleString()}`;
  const text = [
    `RISK: ${risk}`,
    `Why:`,
    `- Deal ${verb} at stage "${deal.stage_name}" for ${amountStr}.`,
    `Next: No action — deal is closed.`,
  ].join("\n");
  return { text, model: "canned", inputTokens: 0, outputTokens: 0 };
}

export async function generateDealSummary(dealId: string): Promise<SummaryResult> {
  const loaded = await loadDealForPrompt(dealId);
  if (!loaded) throw new Error("Deal not found");
  const { deal, timeline } = loaded;

  // Skip Claude entirely for closed deals (won, lost, renewed, churn).
  // The health CTE marks closed deals as health_score = NULL.
  if (deal.health_score === null || deal.health_score === undefined) {
    return cannedClosedSummary(deal);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server");
  }

  const weights = await getHealthWeights();
  const signals: HealthSignals = {
    health_score: deal.health_score,
    regression_count: Number(deal.regression_count ?? 0),
    slip_count: Number(deal.slip_count ?? 0),
    amount_net: parseFloat(String(deal.amount_net ?? 0)),
    next_step_last_update: deal.next_step_last_update,
    stage_entered_at: deal.stage_entered_at,
    stage_name: deal.stage_name,
    next_step: deal.next_step,
  };
  const breakdown = breakdownFor(signals, weights);

  const penaltyLines = breakdown.penalties.length === 0
    ? "Penalties: (none — deal is clean)"
    : `Penalties:\n${breakdown.penalties.map(p => `- −${p.amount}: ${p.label}`).join("\n")}`;

  const userMessage = buildUserMessage(deal, timeline, penaltyLines);

  const client = new Anthropic({ apiKey });
  const model = DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  if (!text) throw new Error("Empty response from model");

  return {
    text,
    model,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  };
}

export interface ParsedSummary {
  risk: string;
  why: string[];
  next: string;
}

export function parseStructuredSummary(text: string): ParsedSummary | null {
  const riskMatch = text.match(/^RISK:\s*(.+?)\s*$/m);
  if (!riskMatch) return null;
  const risk = riskMatch[1].trim();

  const why: string[] = [];
  const whyBlock = text.match(/Why:\s*([\s\S]*?)(?=\n\s*Next:|$)/i);
  if (whyBlock) {
    for (const line of whyBlock[1].split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const bullet = trimmed.replace(/^[-*•]\s*/, "").trim();
      if (bullet) why.push(bullet);
    }
  }

  const nextMatch = text.match(/Next:\s*([\s\S]+?)\s*$/);
  const next = nextMatch ? nextMatch[1].trim() : "";

  return { risk, why, next };
}
