import { embed, EMBEDDING_MODEL, CHAT_MODEL } from "@/lib/gemini";
import { supabasePublic } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health check for deployment: verifies Gemini (embeds a dummy string) and
 * Supabase (counts rows in `chunks`). GET /api/chat/test
 */
export async function GET() {
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
