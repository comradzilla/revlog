import { runFullSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST() {
  try {
    const result = await runFullSync();
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("[sync] Error:", error);
    return Response.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
