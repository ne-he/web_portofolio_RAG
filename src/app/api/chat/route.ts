import { embed, chat } from "@/lib/gemini";
import { matchChunks } from "@/lib/match-chunks";
import { buildPrompt, type InboundMessage } from "@/lib/build-prompt";
import { getClientIp, hit } from "@/lib/rate-limit";
import { checkDailyLimit } from "@/lib/daily-limit";
import { corsHeaders, preflight } from "@/lib/cors";
import { toPublicError } from "@/lib/public-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // ceiling (s) for the streamed Gemini response

// Payload guards, reject obviously abusive bodies before doing any real work.
const MAX_MESSAGES = 40; // a genuine visitor session won't exceed this
const MAX_MESSAGE_CHARS = 2000; // a single user turn
const MAX_TOTAL_CHARS = 16000; // the whole transcript posted in one body

// Retrieval confidence gate. Similarities observed in practice: strong topical
// matches score ~0.72+, unrelated chunks ~0.55 and below. Chunks under MIN_SIM
// are noise, drop them. If even the BEST match is under WEAK_TOP_SIM, the
// knowledge base likely doesn't cover the question, so the prompt flags the
// context as weak and the model falls back to infer/deflect instead of
// confidently answering from off-topic chunks.
const MIN_SIM = 0.55;
const WEAK_TOP_SIM = 0.68;

// CORS preflight, lets the backend serve chatbots on Nehemiah's other sites.
export function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const ip = getClientIp(req);

    // 0. Burst guard (in-memory), one client hammering the endpoint
    //    (refresh spam, runaway loops). See rate-limit.ts.
    const rl = hit(ip);
    if (!rl.ok) {
      return Response.json(
        { error: "Waduh kebanyakan pesan beruntun, istirahat bentar ya, terus coba lagi. 😅" },
        {
          status: 429,
          headers: {
            ...cors,
            "Retry-After": String(rl.retryAfterSec),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
          },
        },
      );
    }

    // 0b. Per-day cap (Supabase-backed), survives serverless cold starts unlike
    //     the in-memory burst guard. Fails OPEN if the usage table isn't set up.
    const daily = await checkDailyLimit(ip);
    if (!daily.ok) {
      const msg =
        daily.reason === "global"
          ? "Lagi rame banget nih, AI Nehemiah istirahat dulu, balik lagi besok ya. 🙏"
          : "Udah lumayan banyak nanya hari ini 😄 lanjut besok ya, biar yang lain juga kebagian.";
      return Response.json(
        { error: msg },
        { status: 429, headers: { ...cors, "Retry-After": "3600" } },
      );
    }

    const body = (await req.json()) as { messages?: InboundMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // 1. Payload guards, bound the work before embedding / calling Gemini.
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return Response.json(
        { error: "Format obrolan nggak valid, coba mulai chat baru ya." },
        { status: 400, headers: cors },
      );
    }
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return Response.json(
        { error: "Obrolannya kepanjangan, mulai chat baru aja ya biar enteng. 🙏" },
        { status: 413, headers: cors },
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !lastUser.content?.trim()) {
      return Response.json(
        { error: "Body must include messages[] with a user message." },
        { status: 400, headers: cors },
      );
    }
    if (lastUser.content.length > MAX_MESSAGE_CHARS) {
      return Response.json(
        { error: "Pesannya kepanjangan (maks 2000 karakter), ringkas dikit ya. 🙏" },
        { status: 413, headers: cors },
      );
    }
    const queryText = lastUser.content.trim();

    // 1. Embed the query  →  2. retrieve top context chunks.
    const queryEmbedding = await embed(queryText);
    const retrieved = await matchChunks(queryEmbedding, queryText, 5);

    // 2b. Confidence gate, drop noise chunks; flag the whole context as weak
    //     when even the best match is a poor fit (question likely not covered).
    const contextChunks = retrieved.filter((c) => c.similarity >= MIN_SIM);
    const topSim = contextChunks[0]?.similarity ?? 0;
    const weakContext = topSim < WEAK_TOP_SIM;

    // 3. Build the prompt. History = everything before the final user turn.
    const priorHistory = messages.slice(0, messages.lastIndexOf(lastUser));
    const { systemInstruction, history, prompt } = buildPrompt(
      queryText,
      contextChunks,
      priorHistory,
      { weakContext },
    );

    // 4. Stream the answer back as Server-Sent Events.
    //    Leak guard: the model must never surface internal bracketed system
    //    notes (e.g. the weak-retrieval marker). If the answer OPENS with a
    //    "[...]" block, buffer it, drop it, and stream from the real content.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let gateDone = false; // leading-bracket check resolved?
        let held = ""; // tokens held back while the check is pending
        const send = (text: string) => {
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
            );
          }
        };
        const feed = (token: string) => {
          if (gateDone) return send(token);
          held += token;
          const lead = held.trimStart();
          if (!lead) return; // still whitespace only, keep holding
          if (!lead.startsWith("[")) {
            gateDone = true; // normal answer, release everything held
            return send(held);
          }
          const close = held.indexOf("]");
          if (close === -1) return; // bracket block still open, keep holding
          gateDone = true; // drop the bracketed note (and following blank lines)
          send(held.slice(close + 1).replace(/^\s+/, ""));
        };
        try {
          for await (const token of chat({ systemInstruction, history, prompt })) {
            feed(token);
          }
          // Stream ended while still holding (e.g. whole answer was one note or
          // an unclosed bracket), release the raw text minus a leading note.
          if (!gateDone) {
            send(held.replace(/^\s*\[[^\]]*\]\s*/, ""));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: toPublicError(err, "chat:stream") })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable proxy buffering so tokens flush live
      },
    });
  } catch (err) {
    // Quota exhaustion is not a server fault, so answer 429 so clients and any
    // uptime monitor read it correctly, and never echo the provider's payload.
    const quota = /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(
      err instanceof Error ? err.message : String(err),
    );
    return Response.json(
      { error: toPublicError(err, "chat:request") },
      {
        status: quota ? 429 : 500,
        headers: quota ? { ...cors, "Retry-After": "3600" } : cors,
      },
    );
  }
}
