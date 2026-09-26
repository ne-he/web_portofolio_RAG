import { embed, EMBEDDING_MODEL, CHAT_MODEL, isQuotaError } from "@/lib/gemini";
import { supabasePublic } from "@/lib/supabase";
import { getClientIp, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * This endpoint is public, so it reports the KIND of failure, never the
 * provider's payload. Google's 429 body carries internal quota metric names and
 * a billing-console link; the full text goes to the server log instead.
 */
function classify(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[chat:test]", raw);
  if (isQuotaError(err)) return "error: quota exhausted";
  if (/\b40[13]\b|api.?key|unauthor|permission/i.test(raw)) return "error: auth rejected";
  if (/\b50\d\b|unavailable|fetch failed|ECONNRESET|ETIMEDOUT/i.test(raw))
    return "error: upstream unreachable";
  return "error: unexpected failure (see server logs)";
}

/**
 * Health check for deployment: verifies Gemini (embeds a dummy string) and
 * Supabase (counts rows in `chunks`). GET /api/chat/test
 */
export async function GET(req: Request) {
  // Every call embeds a string on the free Gemini quota, so it shares the chat
  // burst limit instead of being free to hammer.
  const rl = hit(getClientIp(req));
  if (!rl.ok) {
    return Response.json(
      { ok: false, error: "rate limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const result: {
    ok: boolean;
    gemini: string;
    supabase: string;
    models: { embedding: string; chat: string };
  } = {
    ok: true,
    gemini: "",
    supabase: "",
    models: { embedding: EMBEDDING_MODEL, chat: CHAT_MODEL },
  };

  try {
    const v = await embed("ping");
    result.gemini = `ok (${v.length}-dim embedding)`;
  } catch (err) {
    result.ok = false;
    result.gemini = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  try {
    const { count, error } = await supabasePublic
      .from("chunks")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    result.supabase = `ok (${count ?? 0} chunks)`;
  } catch (err) {
    result.ok = false;
    result.supabase = `error: ${err instanceof Error ? err.message : String(err)}`;
  }

  return Response.json(result, { status: result.ok ? 200 : 503 });
}
