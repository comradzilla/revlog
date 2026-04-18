// Deal Health Score — composite 0-100 computed from signals already captured
// in `deals` + `deal_changelog`. See /plans for the product rationale.
//
// Weights are configurable via the `settings` table (key='health_weights').
// Defaults live here and are used when the settings row is absent.

export interface HealthWeights {
  regression: number;       // per regression event, last 90d
  regressionCap: number;    // max total penalty from regressions
  slip: number;             // per close-date slip event, last 90d
  slipCap: number;          // max total penalty from slips
  amountShrunk: number;     // if net amount change < 0 over last 90d
  timeInStage: number;      // if mid-funnel and stage_entered_at > 30d ago
  staleNextStep: number;    // if mid-funnel and next step not updated 14+d
  noNextStep: number;       // if mid-funnel and next_step is null/empty
  bucketGreen: number;      // score >= this → green
  bucketAmber: number;      // score >= this → amber, else red
}

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  regression: 15,
  regressionCap: 30,
  slip: 10,
  slipCap: 25,
  amountShrunk: 15,
  timeInStage: 10,
  staleNextStep: 10,
  noNextStep: 5,
  bucketGreen: 80,
  bucketAmber: 50,
};

export type HealthBucket = "green" | "amber" | "red" | "closed";

export function bucketFor(score: number | null, w: HealthWeights): HealthBucket {
  if (score === null) return "closed";
  if (score >= w.bucketGreen) return "green";
  if (score >= w.bucketAmber) return "amber";
  return "red";
}

// Mid-funnel stage matcher — mirrors the pattern used by the stale-deals endpoint.
// Renewal alt stages (BAU, Renewed) return false — they don't belong in triage views.
const MID_FUNNEL_RE = /prospect|qualif|solution|proposal|propose|negotiat|exploration|validate/i;
const CLOSED_RE = /closed|renewed|churn/i;

export function isMidFunnel(stageName: string | null | undefined): boolean {
  if (!stageName) return false;
  if (CLOSED_RE.test(stageName)) return false;
  return MID_FUNNEL_RE.test(stageName);
}

// SQL fragments used in the health CTE. Keeping them separate makes it easy
// to reuse the same regex in SQL and JS and keeps the CTE builder readable.
const MID_FUNNEL_SQL = `(d.stage_name ~* '(prospect|qualif|solution|proposal|propose|negotiat|exploration|validate)' AND d.stage_name !~* '(closed|renewed|churn)')`;
const CLOSED_SQL = `(d.stage_name ~* '(closed|renewed|churn)')`;

// Stage regression detection in pure SQL — mirrors isStageRegression() in query-helpers.ts.
// Extracts leading number from old/new labels, true when new < old and new != 0.
const REGRESSION_SQL = `(
  (substring(cl.old_label from '^\\d+'))::int IS NOT NULL
  AND (substring(cl.new_label from '^\\d+'))::int IS NOT NULL
  AND (substring(cl.new_label from '^\\d+'))::int > 0
  AND (substring(cl.new_label from '^\\d+'))::int < (substring(cl.old_label from '^\\d+'))::int
)`;

export interface HealthPenalty {
  code: string;
  label: string;
  amount: number;
}

// Returns the CTE SQL that materializes a health_score column per deal.
// Usage: `${buildHealthCte(weights)} SELECT d.*, h.health_score FROM deals d LEFT JOIN deal_health h ON h.deal_id = d.id`
// The CTE leaves health_score = NULL for closed deals (won/lost/renewed/churn).
export function buildHealthCte(w: HealthWeights): string {
  return `
WITH regression_counts AS (
  SELECT cl.deal_id, COUNT(*)::int AS n
  FROM deal_changelog cl
  WHERE cl.property = 'dealstage'
    AND cl.changed_at >= NOW() - INTERVAL '90 days'
    AND ${REGRESSION_SQL}
  GROUP BY cl.deal_id
),
slip_counts AS (
  SELECT cl.deal_id, COUNT(*)::int AS n
  FROM deal_changelog cl
  WHERE cl.property = 'closedate'
    AND cl.changed_at >= NOW() - INTERVAL '90 days'
    AND NULLIF(cl.new_value, '')::timestamptz IS NOT NULL
    AND NULLIF(cl.old_value, '')::timestamptz IS NOT NULL
    AND NULLIF(cl.new_value, '')::timestamptz > NULLIF(cl.old_value, '')::timestamptz
  GROUP BY cl.deal_id
),
amount_net AS (
  SELECT cl.deal_id,
         SUM(COALESCE(NULLIF(cl.new_value, '')::numeric, 0) - COALESCE(NULLIF(cl.old_value, '')::numeric, 0))::numeric AS net
  FROM deal_changelog cl
  WHERE cl.property = 'amount'
    AND cl.changed_at >= NOW() - INTERVAL '90 days'
  GROUP BY cl.deal_id
),
next_step_last AS (
  SELECT cl.deal_id, MAX(cl.changed_at) AS last_update
  FROM deal_changelog cl
  WHERE cl.property = 'hs_next_step'
  GROUP BY cl.deal_id
),
deal_health AS (
  SELECT
    d.id AS deal_id,
    CASE WHEN ${CLOSED_SQL} THEN NULL
    ELSE GREATEST(0, 100
      - LEAST(${w.regressionCap}, COALESCE(rc.n, 0) * ${w.regression})
      - LEAST(${w.slipCap}, COALESCE(sc.n, 0) * ${w.slip})
      - CASE WHEN COALESCE(an.net, 0) < 0 THEN ${w.amountShrunk} ELSE 0 END
      - CASE WHEN ${MID_FUNNEL_SQL} AND d.stage_entered_at < NOW() - INTERVAL '30 days' THEN ${w.timeInStage} ELSE 0 END
      - CASE WHEN ${MID_FUNNEL_SQL}
             AND COALESCE(nsl.last_update, d.created_at) < NOW() - INTERVAL '14 days'
             AND d.next_step IS NOT NULL AND d.next_step <> ''
             THEN ${w.staleNextStep} ELSE 0 END
      - CASE WHEN ${MID_FUNNEL_SQL} AND (d.next_step IS NULL OR d.next_step = '') THEN ${w.noNextStep} ELSE 0 END
    ) END AS health_score,
    COALESCE(rc.n, 0) AS regression_count,
    COALESCE(sc.n, 0) AS slip_count,
    COALESCE(an.net, 0)::numeric AS amount_net,
    nsl.last_update AS next_step_last_update
  FROM deals d
  LEFT JOIN regression_counts rc ON rc.deal_id = d.id
  LEFT JOIN slip_counts sc ON sc.deal_id = d.id
  LEFT JOIN amount_net an ON an.deal_id = d.id
  LEFT JOIN next_step_last nsl ON nsl.deal_id = d.id
)`.trim();
}

// Reconstruct a penalty breakdown from the raw signal counts the CTE exposes.
// Used by the drawer / tooltip to explain why a score is what it is.
export interface HealthBreakdown {
  score: number | null;
  bucket: HealthBucket;
  penalties: HealthPenalty[];
}

export interface HealthSignals {
  health_score: number | null;
  regression_count: number;
  slip_count: number;
  amount_net: number;
  next_step_last_update: string | null;
  stage_entered_at: string | null;
  stage_name: string | null;
  next_step: string | null;
}

export function breakdownFor(signals: HealthSignals, w: HealthWeights): HealthBreakdown {
  const score = signals.health_score;
  const bucket = bucketFor(score, w);
  if (score === null) return { score, bucket, penalties: [] };

  const penalties: HealthPenalty[] = [];
  if (signals.regression_count > 0) {
    const amt = Math.min(w.regressionCap, signals.regression_count * w.regression);
    penalties.push({
      code: "regression",
      label: `${signals.regression_count} stage regression${signals.regression_count > 1 ? "s" : ""} in last 90 days`,
      amount: amt,
    });
  }
  if (signals.slip_count > 0) {
    const amt = Math.min(w.slipCap, signals.slip_count * w.slip);
    penalties.push({
      code: "slip",
      label: `${signals.slip_count} close-date slip${signals.slip_count > 1 ? "s" : ""} in last 90 days`,
      amount: amt,
    });
  }
  if (signals.amount_net < 0) {
    penalties.push({
      code: "amount_shrunk",
      label: `Amount shrank (net ${fmtMoney(signals.amount_net)} over last 90d)`,
      amount: w.amountShrunk,
    });
  }
  const midFunnel = isMidFunnel(signals.stage_name);
  if (midFunnel && signals.stage_entered_at) {
    const ageDays = Math.floor((Date.now() - new Date(signals.stage_entered_at).getTime()) / 86400000);
    if (ageDays > 30) {
      penalties.push({
        code: "time_in_stage",
        label: `In current stage ${ageDays} days (>30d)`,
        amount: w.timeInStage,
      });
    }
  }
  if (midFunnel && signals.next_step && signals.next_step !== "") {
    const last = signals.next_step_last_update ? new Date(signals.next_step_last_update).getTime() : 0;
    const ageDays = last > 0 ? Math.floor((Date.now() - last) / 86400000) : Infinity;
    if (ageDays > 14) {
      penalties.push({
        code: "stale_next_step",
        label: `Next step not updated in ${isFinite(ageDays) ? ageDays + " days" : "over 14 days"}`,
        amount: w.staleNextStep,
      });
    }
  }
  if (midFunnel && (!signals.next_step || signals.next_step === "")) {
    penalties.push({
      code: "no_next_step",
      label: "No next step set",
      amount: w.noNextStep,
    });
  }

  return { score, bucket, penalties };
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Trend icon dimensions — three independent signals shown as glanceable
// icons next to each deal: HEALTH (heart), SIZE (dollar tier), MOMENTUM (arrow).

export type SizeTier = "small" | "medium" | "large";
export type Momentum = "up" | "flat" | "down";

export interface SizeTiers {
  smallMax: number;   // amount <= this → small
  mediumMax: number;  // amount <= this → medium, else large
}

export const DEFAULT_SIZE_TIERS: SizeTiers = {
  smallMax: 50_000,
  mediumMax: 200_000,
};

export function sizeOf(amount: number, tiers: SizeTiers = DEFAULT_SIZE_TIERS): SizeTier {
  if (amount <= tiers.smallMax) return "small";
  if (amount <= tiers.mediumMax) return "medium";
  return "large";
}

// Momentum is derived from signals already in the health CTE — no SQL changes.
// DOWN: any regression in last 90d, OR ≥2 close-date slips, OR amount net negative
// UP: amount net positive AND no regressions AND no slips
// FLAT: anything else (no recent meaningful movement)
export interface MomentumSignals {
  regression_count?: number | null;
  slip_count?: number | null;
  amount_net?: number | null;
}

export function momentumOf(s: MomentumSignals): Momentum {
  const regs = Number(s.regression_count ?? 0);
  const slips = Number(s.slip_count ?? 0);
  const net = Number(s.amount_net ?? 0);

  if (regs > 0 || slips >= 2 || net < 0) return "down";
  if (net > 0 && regs === 0 && slips === 0) return "up";
  return "flat";
}
