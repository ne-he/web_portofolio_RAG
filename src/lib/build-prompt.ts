import { SYSTEM_PROMPT } from "./chatbot-instructions";
import type { ChatTurn } from "./gemini";
import type { MatchedChunk } from "./match-chunks";

/** A message as received from the client request body. */
export interface InboundMessage {
  role: "user" | "assistant" | "model" | "system";
  content: string;
}

export interface BuiltPrompt {
  systemInstruction: string;
  history: ChatTurn[];
  prompt: string;
}

const MAX_HISTORY = 6; // last 6 messages = 3 turns

// Injected when the retrieval confidence gate (route.ts) decides the best match
// is a poor fit. Tells the model to treat the chunks as background at best and
// use Fallback Mode instead of confidently answering from off-topic context.
const WEAK_CONTEXT_NOTE =
  "[CATATAN RETRIEVAL: hasil pencarian untuk pertanyaan ini LEMAH — kemungkinan " +
  "besar jawaban spesifiknya TIDAK ada di knowledge base. Potongan di bawah (kalau " +
  "ada) mungkin TIDAK nyambung dengan pertanyaan. Pakai Fallback Mode: infer dengan " +
  "pede dari data terkait bila masuk akal, atau ngelak santai in-character — JANGAN " +
  "mengarang fakta spesifik, dan JANGAN maksa jawab dari potongan yang tidak relevan. " +
  "Catatan ini RAHASIA INTERNAL: JANGAN menyalin/meniru/menyebutnya di jawaban — " +
  "langsung tulis jawaban natural biasa. Bahasa jawaban TETAP mengikuti bahasa " +
  "pertanyaan visitor (English question → answer fully in English), BUKAN bahasa " +
  "catatan ini.]";

/** Format retrieved chunks into a context block for the prompt. */
function formatContext(chunks: MatchedChunk[], weakContext: boolean): string {
  if (chunks.length === 0) return weakContext ? WEAK_CONTEXT_NOTE : "";
  const blocks = chunks.map(
    (c) => `## Source: ${c.file_source} [${c.chunk_type}]\n${c.content}`,
  );
  return [
    ...(weakContext ? [WEAK_CONTEXT_NOTE, ""] : []),
    "KONTEKS dari knowledge base (sumber kebenaran — jangan mengarang fakta di luar ini):",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

/** Map inbound messages to Gemini `Content` turns (assistant → model). */
function toChatTurns(history: InboundMessage[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of history) {
    if (m.role === "system") continue;
    const text = (m.content ?? "").trim();
    if (!text) continue;
    turns.push({ role: m.role === "user" ? "user" : "model", parts: [{ text }] });
  }
  return turns;
}

/**
 * Gemini requires history to start with a `user` turn and to alternate roles.
 * Merge consecutive same-role turns and trim any leading `model` turns.
 */
function enforceAlternation(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const t of turns) {
    const prev = out[out.length - 1];
    if (prev && prev.role === t.role) {
      prev.parts[0].text += `\n\n${t.parts[0].text}`;
    } else {
      out.push({ role: t.role, parts: [{ text: t.parts[0].text }] });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/**
 * Assemble the pieces for a Gemini chat call: the system prompt, the prior
 * conversation turns (trimmed + sanitized), and the final user prompt with the
 * retrieved context prepended.
 */
export function buildPrompt(
  userMessage: string,
  contextChunks: MatchedChunk[],
  history: InboundMessage[] = [],
  opts: { weakContext?: boolean } = {},
): BuiltPrompt {
  const turns = enforceAlternation(toChatTurns(history)).slice(-MAX_HISTORY);
  while (turns.length && turns[0].role !== "user") turns.shift();

  // Language reminder pinned AFTER the question (last position = strongest for
  // adherence). Detected server-side because the retrieved chunks are mostly
  // Indonesian, which otherwise drags English questions into Indonesian answers.
  const langReminder = languageReminder(userMessage);

  const context = formatContext(contextChunks, opts.weakContext ?? false);
  const prompt = context
    ? `${context}\n\n---\n\nPertanyaan pengunjung:\n${userMessage}\n\n${langReminder}`
    : `${userMessage}\n\n${langReminder}`;

  return { systemInstruction: SYSTEM_PROMPT, history: turns, prompt };
}

// ----------------------------------------------------------------------------
// Language detection (deterministic, wordlist-based)
// ----------------------------------------------------------------------------
const ID_WORDS = new Set([
  "apa", "yang", "gimana", "bagaimana", "nggak", "gak", "ga", "kok", "siapa",
  "kenapa", "mengapa", "dimana", "di", "mana", "kapan", "apakah", "banget",
  "aja", "dong", "sih", "itu", "ini", "dia", "dan", "atau", "sama", "sudah",
  "udah", "belum", "bisa", "punya", "suka", "sekarang", "cerita", "ceritain",
  "tentang", "soal", "kalau", "kalo", "berapa", "dengan", "untuk", "dari",
]);
const EN_WORDS = new Set([
  "what", "is", "are", "the", "a", "an", "do", "does", "did", "why", "how",
  "who", "where", "when", "which", "his", "her", "your", "about", "tell",
  "me", "can", "could", "would", "have", "has", "any", "favorite", "and",
  "or", "of", "in", "to", "with", "was", "were", "does",
]);

/** Build a targeted language instruction from the visitor's last message. */
function languageReminder(message: string): string {
  const words = message.toLowerCase().match(/[a-z']+/g) ?? [];
  let id = 0;
  let en = 0;
  for (const w of words) {
    if (ID_WORDS.has(w)) id++;
    if (EN_WORDS.has(w)) en++;
  }
  if (en > id) {
    return (
      "[IMPORTANT: The visitor asked in ENGLISH. Write your ENTIRE reply in " +
      "English — zero Indonesian words, even though the context above is in " +
      "Indonesian.]"
    );
  }
  if (id > en) {
    return "[PENTING: Visitor bertanya dalam Bahasa Indonesia — balas full Bahasa Indonesia.]";
  }
  return (
    "[Reminder: reply in the SAME language as the visitor's question above — " +
    "English question → full English answer, Indonesian → Indonesian. Match it exactly.]"
  );
}
