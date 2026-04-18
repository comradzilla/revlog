import { DEFAULT_HEALTH_WEIGHTS, type HealthWeights } from "@/lib/health";
import { getHealthWeights, setHealthWeights } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const weights = await getHealthWeights();
    return Response.json({ weights, defaults: DEFAULT_HEALTH_WEIGHTS });
  } catch (error) {
    console.error("GET /api/settings/health error:", error);
    return Response.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

const NUMERIC_KEYS: (keyof HealthWeights)[] = [
  "regression", "regressionCap", "slip", "slipCap", "amountShrunk",
  "timeInStage", "staleNextStep", "noNextStep", "bucketGreen", "bucketAmber",
];

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const incoming = body?.weights as Partial<Record<keyof HealthWeights, unknown>> | undefined;
    if (!incoming || typeof incoming !== "object") {
      return Response.json({ error: "Missing weights object" }, { status: 400 });
    }

    const merged: HealthWeights = { ...DEFAULT_HEALTH_WEIGHTS };
    for (const key of NUMERIC_KEYS) {
      const raw = incoming[key];
      if (raw === undefined || raw === null || raw === "") continue;
      const n = typeof raw === "number" ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return Response.json({ error: `Invalid value for ${key}: must be 0-100` }, { status: 400 });
      }
      merged[key] = n;
    }

    if (merged.bucketAmber >= merged.bucketGreen) {
      return Response.json({ error: "Amber threshold must be below green threshold" }, { status: 400 });
    }

    await setHealthWeights(merged);
    return Response.json({ weights: merged });
  } catch (error) {
    console.error("PUT /api/settings/health error:", error);
    return Response.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
