import { embed, chat } from "@/lib/gemini";
import { matchChunks } from "@/lib/match-chunks";
import { buildPrompt, type InboundMessage } from "@/lib/build-prompt";
import { getClientIp, hit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // ceiling (s) for the streamed Gemini response

// Payload guards — reject obviously abusive bodies before doing any real work.
const MAX_MESSAGES = 40; // a genuine visitor session won't exceed this
const MAX_MESSAGE_CHARS = 2000; // a single user turn
const MAX_TOTAL_CHARS = 16000; // the whole transcript posted in one body

export async function POST(req: Request) {
  try {
    // 0. Rate-limit by client IP — a cheap in-memory guard against one client
    //    hammering the endpoint (refresh spam, runaway loops). See rate-limit.ts.
    const rl = hit(getClientIp(req));
    if (!rl.ok) {
      return Response.json(
        { error: "Waduh kebanyakan pesan beruntun — istirahat bentar ya, terus coba lagi. 😅" },
        {
          status: 429,
          headers: {
            "Retry-After": String(rl.retryAfterSec),
            "X-RateLimit-Limit": String(rl.limit),
            "X-RateLimit-Remaining": String(rl.remaining),
          },
        },
      );
    }

    const body = (await req.json()) as { messages?: InboundMessage[] };
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // 1. Payload guards — bound the work before embedding / calling Gemini.
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return Response.json(
        { error: "Format obrolan nggak valid — coba mulai chat baru ya." },
        { status: 400 },
      );
    }
    const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return Response.json(
        { error: "Obrolannya kepanjangan — mulai chat baru aja ya biar enteng. 🙏" },
        { status: 413 },
      );
    }

    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || !lastUser.content?.trim()) {
      return Response.json(
        { error: "Body must include messages[] with a user message." },
        { status: 400 },
      );
    }
    if (lastUser.content.length > MAX_MESSAGE_CHARS) {
      return Response.json(
        { error: "Pesannya kepanjangan (maks 2000 karakter) — ringkas dikit ya. 🙏" },
        { status: 413 },
      );
    }
    const queryText = lastUser.content.trim();

    // 1. Embed the query  →  2. retrieve top context chunks.
    const queryEmbedding = await embed(queryText);
    const contextChunks = await matchChunks(queryEmbedding, queryText, 5);

    // 3. Build the prompt. History = everything before the final user turn.
    const priorHistory = messages.slice(0, messages.lastIndexOf(lastUser));
    const { systemInstruction, history, prompt } = buildPrompt(
      queryText,
      contextChunks,
      priorHistory,
    );

    // 4. Stream the answer back as Server-Sent Events.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const token of chat({ systemInstruction, history, prompt })) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: token })}\n\n`),
            );
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // disable proxy buffering so tokens flush live
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
