// Next.js instrumentation hook — runs once on server start.
// Schedules automatic sync timers so no external cron is needed.

const INCREMENTAL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const FULL_SYNC_HOUR = 2; // 2 AM local time

function msUntilNextHour(hour: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

async function triggerSync(tier: "incremental" | "full") {
  try {
    const port = process.env.PORT || 3000;
    const secret = process.env.CRON_SECRET ? `&secret=${process.env.CRON_SECRET}` : "";
    const res = await fetch(`http://localhost:${port}/api/cron?tier=${tier}${secret}`);
    if (!res.ok) {
      console.error(`[scheduler] ${tier} sync failed: ${res.status}`);
    }
  } catch (err) {
    console.error(`[scheduler] ${tier} sync error:`, err);
  }
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[scheduler] Registering sync timers...");

    // Tier 1: Incremental sync every 5 minutes
    setInterval(() => triggerSync("incremental"), INCREMENTAL_INTERVAL);

    // Run first incremental sync 30s after boot (let server stabilize)
    setTimeout(() => triggerSync("incremental"), 30_000);

    // Tier 2: Full sync daily at 2 AM
    const msToFull = msUntilNextHour(FULL_SYNC_HOUR);
    console.log(`[scheduler] Next full sync in ${(msToFull / 3600000).toFixed(1)}h`);

    setTimeout(() => {
      triggerSync("full");
      // Then repeat every 24 hours
      setInterval(() => triggerSync("full"), 24 * 60 * 60 * 1000);
    }, msToFull);

    console.log("[scheduler] Incremental: every 5 min | Full: daily at 2 AM");
  }
}
