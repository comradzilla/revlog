import { runIncrementalSync, runFullSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET endpoint for cron jobs (curl-friendly)
// Usage:
//   curl http://localhost:3000/api/cron                    → incremental (default)
//   curl http://localhost:3000/api/cron?tier=incremental   → incremental
//   curl http://localhost:3000/api/cron?tier=full          → full sync
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tier = searchParams.get("tier") || "incremental";

  try {
    const start = Date.now();
    const result = tier === "full"
      ? await runFullSync()
      : await runIncrementalSync();
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`[cron:${tier}] Completed in ${duration}s`);

    return Response.json({
      success: true,
      duration: `${duration}s`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[cron:${tier}] Sync error:`, error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
