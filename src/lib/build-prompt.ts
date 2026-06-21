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

/** Format retrieved chunks into a context block for the prompt. */
function formatContext(chunks: MatchedChunk[]): string {
  if (chunks.length === 0) return "";
  const blocks = chunks.map(
    (c) => `## Source: ${c.file_source} [${c.chunk_type}]\n${c.content}`,
  );
  return [
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
): BuiltPrompt {
  const turns = enforceAlternation(toChatTurns(history)).slice(-MAX_HISTORY);
  while (turns.length && turns[0].role !== "user") turns.shift();

  // Reminder pinned right next to the question — strongest position for adherence.
  // Backs up system-prompt rule #00: always answer in the visitor's own language.
  const langReminder =
    "[Reminder: reply in the SAME language as the visitor's question below — English question → full English answer, Indonesian → Indonesian. Match it exactly.]";

  const context = formatContext(contextChunks);
  const prompt = context
    ? `${context}\n\n---\n\n${langReminder}\n\nPertanyaan pengunjung:\n${userMessage}`
    : `${langReminder}\n\n${userMessage}`;

  return { systemInstruction: SYSTEM_PROMPT, history: turns, prompt };
}
