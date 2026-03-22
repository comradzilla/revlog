import { runFullSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET endpoint for cron jobs (curl-friendly)
// Usage: curl http://localhost:3000/api/cron
// Or set up a system cron: */10 * * * * curl -s http://localhost:3000/api/cron
export async function GET(request: Request) {
  // Optional: verify cron secret for security
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (expectedSecret && secret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const start = Date.now();
    const result = await runFullSync();
    const duration = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`[cron] Sync completed in ${duration}s: ${result.deals} deals, ${result.changelog} changelog entries`);

    return Response.json({
      success: true,
      duration: `${duration}s`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Sync error:", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
