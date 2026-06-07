import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import matter from "gray-matter";

// Generates src/lib/chatbot-instructions.ts from the markdown source so we never
// hand-escape ~230 lines of backtick-heavy content into a template literal.
// Source now lives in-repo (an external cv-data path got lost on a folder move).
const DEFAULT_SRC = resolve(process.cwd(), "prompts/chatbot-instructions.md");

const src = process.argv[2] ?? DEFAULT_SRC;
const out = resolve(process.cwd(), "src/lib/chatbot-instructions.ts");

// gray-matter strips the YAML frontmatter (dev meta) — we only want the body.
const { content } = matter(readFileSync(src, "utf8"));
const body = content.trim();

// Escape so the body is safe inside a TS template literal (order matters).
const escaped = body
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const file = `// AUTO-GENERATED — do not edit by hand.
// Source: prompts/chatbot-instructions.md
// Regenerate after editing the source: npx tsx scripts/gen-system-prompt.ts

/**
 * System prompt for the RAG chatbot ("AI Nehemiah"). Loaded as the Gemini
 * \`systemInstruction\` at the start of every chat session — it is NOT a
 * retrieved chunk (the source markdown is excluded from ingestion).
 */
export const SYSTEM_PROMPT = \`${escaped}\`;
`;

writeFileSync(out, file, "utf8");
console.log(`Wrote ${out} (${body.length} chars from ${src})`);
