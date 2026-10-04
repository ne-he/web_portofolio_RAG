// Gemini over plain REST. The old @google/generative-ai SDK is no longer
// maintained by Google and never had typed fields for outputDimensionality or
// thinkingConfig anyway, so every call here goes straight to the v1beta API.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[gemini] Missing environment variable: ${name}`);
  return value;
}

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Model IDs (project decision: Gemini stack).
// NOTE: text-embedding-004 is NOT available to this API key. The available
// embedding model is gemini-embedding-001, whose native output is 3072-dim, so
// we request `outputDimensionality: 768` (Matryoshka) to match the Supabase
// `vector(768)` column.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;
// Synthetic-question generation runs at high volume during ingest, so it uses
// the lighter/cheaper gemini-2.5-flash-lite.
export const SYNTHETIC_Q_MODEL = "gemini-2.5-flash-lite";

// Free-tier generateContent quota is small and PER MODEL (20 req/day on both
// gemini-2.5-flash and gemini-3.8-flash), so the chain is the bot's daily
// capacity: every model added is another day's budget. All of these were checked
// on this key (4 Oct 2026) to answer with thinkingBudget 0. 3.6 and 3.5 lead
// because they streamed a first token in ~2 s, while 3.8 and 3.7 kept answering
// 503 "high demand" and took 10 to 30 s when they did answer (eval 4 Oct 2026).
// GEMINI_CHAT_MODELS (comma-separated) overrides the order without a deploy.
const DEFAULT_CHAT_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
];
export const CHAT_MODELS: readonly string[] = (() => {
  const fromEnv = (process.env.GEMINI_CHAT_MODELS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_CHAT_MODELS;
})();
export const CHAT_MODEL = CHAT_MODELS[0];

/** True when the provider refused for quota/rate reasons rather than a real bug. */
export function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED|exhaust/i.test(msg);
}

/** True when the provider is temporarily unavailable (worth retrying or rotating). */
function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b50\d\b|overload|unavailable|fetch failed|ECONNRESET|ETIMEDOUT|empty response|first token|abort/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST to a model endpoint. Throws with the status and body so callers can classify. */
async function post(
  model: string,
  method: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Response> {
  const res = await fetch(`${API_BASE}/${model}:${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": requireEnv("GEMINI_API_KEY"),
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    // The body carries "Please retry in Ns" on 429s, which the ingest scripts parse.
    throw new Error(`${model}:${method} ${res.status}: ${(await res.text()).slice(0, 2000)}`);
  }
  return res;
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
  }[];
}

function textOf(json: GenerateResponse): string {
  return (json.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
}

/**
 * Embed a single string into a unit-normalized 768-dim vector.
 * Normalization is recommended for reduced Matryoshka dimensions and is safe for
 * cosine similarity, so retrieval works regardless of the distance operator the
 * `match_chunks` RPC uses.
 *
 * Retries twice on a 429/5xx: the 3 Oct 2026 health check caught a one-off 503
 * from this endpoint, and without a retry that visitor would get no answer.
 */
export async function embed(text: string): Promise<number[]> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(attempt * 400);
    try {
      const res = await post(EMBEDDING_MODEL, "embedContent", {
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIM,
      });
      const json = (await res.json()) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values;
      if (!values || values.length !== EMBEDDING_DIM) {
        throw new Error(
          `embedContent returned ${values?.length ?? 0} dims (expected ${EMBEDDING_DIM})`,
        );
      }
      const norm = Math.hypot(...values) || 1;
      return values.map((x) => x / norm);
    } catch (err) {
      lastErr = err;
      if (!isQuotaError(err) && !isTransientError(err)) throw err;
    }
  }
  throw lastErr;
}

/** A single conversation turn in Gemini's `Content` shape. */
export interface ChatTurn {
  role: "user" | "model";
  parts: { text: string }[];
}

export interface ChatParams {
  /** System prompt (persona + rules). See chatbot-instructions.ts. */
  systemInstruction: string;
  /** Prior turns (already trimmed + sanitized by buildPrompt). */
  history: ChatTurn[];
  /** The final user message, with retrieved context prepended. */
  prompt: string;
}

// A model that just answered 429 is skipped for a while, so a warm serverless
// instance does not pay a failed round trip on every visitor once a model's
// daily budget is gone. Per instance and best effort, which is all it needs.
const QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
const coolingUntil = new Map<string, number>();

// A model under load can sit 10 to 30 s before its first token (seen on 3.8 and
// 3.7 Flash, 4 Oct 2026). Past this wait, the next model in the chain is the
// faster answer. The last model in the chain is never cut off. A model that
// stalled is skipped briefly too, so the next visitors do not each wait 8 s.
const FIRST_TOKEN_TIMEOUT_MS = 8_000;
const STALL_COOLDOWN_MS = 2 * 60 * 1000;

function modelsToTry(): string[] {
  const now = Date.now();
  const ready = CHAT_MODELS.filter((m) => (coolingUntil.get(m) ?? 0) <= now);
  // Every model cooling down: try them all anyway, a budget may have reset.
  return ready.length ? ready : [...CHAT_MODELS];
}

/**
 * Yield the text of each SSE event from a streamGenerateContent response.
 * An answer that stops for any reason other than STOP is logged: the 4 Oct 2026
 * eval caught two replies cut mid-sentence with no error on the stream.
 */
async function* readSse(res: Response, model: string): AsyncIterable<string> {
  if (!res.body) return;
  let finishReason = "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) !== -1) {
      const event = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      const data = event
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("");
      if (!data) continue;
      const json = JSON.parse(data) as GenerateResponse;
      finishReason = json.candidates?.[0]?.finishReason ?? finishReason;
      const text = textOf(json);
      if (text) yield text;
    }
  }
  if (finishReason && finishReason !== "STOP") {
    console.warn(`[gemini] ${model} stopped early: finishReason ${finishReason}`);
  } else if (!finishReason) {
    console.warn(`[gemini] ${model} stream ended without a finishReason`);
  }
}

/**
 * Stream a chat completion. Yields text tokens as they arrive so the API route
 * can forward them to the client.
 *
 * Model fallback: free-tier quota is per model, so when one model is exhausted
 * (or momentarily overloaded) the same turn is retried on the next model in
 * CHAT_MODELS. Fallback only applies BEFORE the first token is emitted. Once
 * the visitor is reading a partial answer, restarting on another model would
 * duplicate text, so a mid-stream failure is surfaced instead.
 */
export async function* chat({
  systemInstruction,
  history,
  prompt,
}: ChatParams): AsyncIterable<string> {
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [...history, { role: "user", parts: [{ text: prompt }] }],
    // Thinking adds seconds of first-token latency, and this bot only
    // synthesizes already-retrieved context, so it is switched off.
    generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
  };

  const models = modelsToTry();
  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const modelName = models[i];
    let emitted = false;
    const controller = new AbortController();
    const timer =
      i < models.length - 1
        ? setTimeout(
            () => controller.abort(new Error(`${modelName}: no first token after ${FIRST_TOKEN_TIMEOUT_MS} ms`)),
            FIRST_TOKEN_TIMEOUT_MS,
          )
        : undefined;
    try {
      const res = await post(modelName, "streamGenerateContent?alt=sse", body, controller.signal);
      for await (const text of readSse(res, modelName)) {
        if (!emitted) clearTimeout(timer);
        emitted = true;
        yield text;
      }
      // A blocked or empty answer is worth one more model rather than a blank reply.
      if (!emitted) throw new Error(`${modelName}: empty response`);
      return;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (isQuotaError(err)) coolingUntil.set(modelName, Date.now() + QUOTA_COOLDOWN_MS);
      else if (controller.signal.aborted) coolingUntil.set(modelName, Date.now() + STALL_COOLDOWN_MS);
      const worthRotating = isQuotaError(err) || isTransientError(err);
      if (emitted || !worthRotating || i === models.length - 1) throw err;
      console.warn(
        `[gemini] ${modelName} unavailable (${isQuotaError(err) ? "quota" : "transient"}), falling back to ${models[i + 1]}`,
      );
    }
  }
  throw lastErr ?? new Error("[gemini] chat: no model produced a response");
}

/**
 * Generate exactly 3 synthetic questions that the given chunk answers. Used at
 * ingest time to widen retrieval recall (questions are embedded as their own
 * rows pointing back to the parent chunk).
 */
export async function generateSyntheticQuestions(
  chunkText: string,
  modelName: string = SYNTHETIC_Q_MODEL,
): Promise<string[]> {
  const prompt = [
    'Anda membantu membangun sistem RAG untuk portofolio/CV Nehemiah ("Nemi").',
    "Berikut satu potongan (chunk) dari knowledge base:",
    '"""',
    chunkText,
    '"""',
    "Tuliskan TEPAT 3 pertanyaan natural (Bahasa Indonesia) yang mungkin diajukan",
    "pengunjung situs dan yang TERJAWAB oleh potongan di atas. Variasikan sudut",
    "pandang (rekruter, teman, orang awam). Jangan mengarang fakta di luar teks.",
    'Balas HANYA berupa array JSON of string. Contoh: ["...", "...", "..."]',
  ].join("\n");

  const res = await post(modelName, "generateContent", {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });
  return parseQuestions(textOf((await res.json()) as GenerateResponse));
}

/** Best-effort parse of the model's JSON output into up to 3 clean questions. */
function parseQuestions(raw: string): string[] {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown })?.questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;
    if (arr) {
      return arr.map((q) => String(q).trim()).filter(Boolean).slice(0, 3);
    }
  } catch {
    // Fall through to line-based parsing below.
  }

  // Fallback: strip list markers / quotes line by line.
  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[\s\-\d.)\]"']+/, "").replace(/["',]+$/, "").trim())
    .filter((line) => line.length > 5)
    .slice(0, 3);
}
