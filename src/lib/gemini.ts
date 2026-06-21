import { GoogleGenerativeAI, type Content, type GenerationConfig } from "@google/generative-ai";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[gemini] Missing environment variable: ${name}`);
  return value;
}

const genAI = new GoogleGenerativeAI(requireEnv("GEMINI_API_KEY"));

// Model IDs (project decision: Gemini stack).
// NOTE: text-embedding-004 is NOT available to this API key. The available
// embedding model is gemini-embedding-001, whose native output is 3072-dim, so
// we request `outputDimensionality: 768` (Matryoshka) to match the Supabase
// `vector(768)` column. The installed SDK (@google/generative-ai@0.24.1) has no
// field for that param, so embed() calls the REST endpoint directly.
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;
// gemini-2.0-flash has ZERO free-tier quota for this API key (verified), so chat
// uses gemini-2.5-flash. Synthetic-question generation runs at high volume during
// ingest, so it uses the lighter/cheaper gemini-2.5-flash-lite.
export const CHAT_MODEL = "gemini-2.5-flash";
export const SYNTHETIC_Q_MODEL = "gemini-2.5-flash-lite";

/**
 * Embed a single string into a unit-normalized 768-dim vector.
 * Normalization is recommended for reduced Matryoshka dimensions and is safe for
 * cosine similarity, so retrieval works regardless of the distance operator the
 * `match_chunks` RPC uses.
 */
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": requireEnv("GEMINI_API_KEY"),
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIM,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`embedContent ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { embedding?: { values?: number[] } };
  const values = json.embedding?.values;
  if (!values || values.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedContent returned ${values?.length ?? 0} dims (expected ${EMBEDDING_DIM})`,
    );
  }
  const norm = Math.hypot(...values) || 1;
  return values.map((x) => x / norm);
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

/**
 * Stream a chat completion from gemini-2.0-flash. Yields text tokens as they
 * arrive so the API route can forward them to the client.
 */
export async function* chat({
  systemInstruction,
  history,
  prompt,
}: ChatParams): AsyncIterable<string> {
  // gemini-2.5-flash "thinks" before answering by default, which adds several
  // seconds of first-token latency. This bot only synthesizes already-retrieved
  // context, so thinking is wasted effort — disable it for a snappy reply.
  // The legacy SDK has no typed field for this but forwards `generationConfig`
  // verbatim to the REST API, which honors thinkingBudget: 0 on 2.5 models.
  const generationConfig = {
    thinkingConfig: { thinkingBudget: 0 },
  } as unknown as GenerationConfig;
  const model = genAI.getGenerativeModel({ model: CHAT_MODEL, systemInstruction, generationConfig });
  const session = model.startChat({ history: history as Content[] });
  const result = await session.sendMessageStream(prompt);
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
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
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json", temperature: 0.4 },
  });

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

  const result = await model.generateContent(prompt);
  return parseQuestions(result.response.text());
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
