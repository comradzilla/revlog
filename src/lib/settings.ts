import { query } from "@/lib/db";
import { DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from "@/lib/health";

// Settings are stored as JSONB in a single-row-per-key table. Defaults live
// in code so a fresh install works before the settings UI has been touched.

const HEALTH_KEY = "health_weights";

let cached: { weights: HealthWeights; fetchedAt: number } | null = null;
const CACHE_MS = 30_000;

export async function getHealthWeights(): Promise<HealthWeights> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.weights;
  try {
    const result = await query(`SELECT value FROM settings WHERE key = $1`, [HEALTH_KEY]);
    if (result.rows.length === 0) {
      cached = { weights: DEFAULT_HEALTH_WEIGHTS, fetchedAt: Date.now() };
      return DEFAULT_HEALTH_WEIGHTS;
    }
    const raw = result.rows[0].value as Partial<HealthWeights>;
    const merged: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS, ...raw };
    cached = { weights: merged, fetchedAt: Date.now() };
    return merged;
  } catch {
    // Table might not exist yet on first migration. Return defaults.
    return DEFAULT_HEALTH_WEIGHTS;
  }
}

export async function setHealthWeights(weights: HealthWeights): Promise<void> {
  await query(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [HEALTH_KEY, JSON.stringify(weights)]
  );
  cached = { weights, fetchedAt: Date.now() };
}

export function invalidateSettingsCache(): void {
  cached = null;
}
