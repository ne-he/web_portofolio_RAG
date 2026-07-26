import { supabasePublic } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Keep-alive ping for the Supabase free tier, which pauses a project after ~7
 * days of no database activity. A paused DB means every visitor question fails,
 * so this route exists purely to touch the `chunks` table on a schedule.
 *
 * Driven by the Vercel cron in `vercel.json` (primary) and by
 * `.github/workflows/keep-alive.yml` (backup). Both just GET this URL, so
 * neither needs any credentials: the Supabase keys live in the deployment env.
 *
 * Deliberately does NOT call Gemini (unlike `/api/chat/test`) so a daily cron
 * never eats into the free-tier Gemini request quota.
 */
export async function GET() {
  const startedAt = Date.now();

  try {
    const { count, error } = await supabasePublic
      .from("chunks")
      .select("*", { count: "exact", head: true });
    if (error) throw error;

    return Response.json({
      ok: true,
      chunks: count ?? 0,
      ms: Date.now() - startedAt,
      at: new Date().toISOString(),
    });
  } catch (err) {
    // 503 so the cron/workflow surfaces a loud failure instead of silently
    // "succeeding" while the database is actually paused or unreachable.
    return Response.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - startedAt,
        at: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
