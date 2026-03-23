import { runIncrementalSync, runFullSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/sync           → full sync (manual trigger, Tier 3)
// POST /api/sync?tier=incremental → incremental only
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tier = searchParams.get("tier") || "full";

    const start = Date.now();
    const result = tier === "incremental"
      ? await runIncrementalSync()
      : await runFullSync();
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    return Response.json({ success: true, duration: `${duration}s`, ...result });
  } catch (error) {
    console.error("[sync] Error:", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
