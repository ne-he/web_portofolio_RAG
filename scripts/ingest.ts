import "./load-env"; // MUST be first: populates process.env before supabase/gemini load.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { randomUUID } from "node:crypto";
import matter from "gray-matter";

import { embed, generateSyntheticQuestions } from "../src/lib/gemini";
import { supabaseAdmin } from "../src/lib/supabase";

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------
// Knowledge-base location. Override with env `CV_DATA_DIR` or `--source <path>`.
// (The folder moved again — now lives directly under nemi/cv. Keep this current.)
const DEFAULT_SOURCE =
  process.env.CV_DATA_DIR ??
  "C:/Users/wilhe/OneDrive/Documents/nemi/cv/cv-data";

const MAX_TOKENS = 800; // upper bound per chunk
const MAX_CHARS = MAX_TOKENS * 4; // ~4 chars/token => 3200 chars
const MIN_CHARS = 25; // drop near-empty fragments
const RATE_LIMIT_MS = 200; // min spacing between Gemini API calls
const INSERT_BATCH = 10;
const SYNTHETIC_Q_COUNT = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const estTokens = (text: string) => Math.ceil(text.length / 4);

// ----------------------------------------------------------------------------
// CLI args
// ----------------------------------------------------------------------------
function parseArgs(argv: string[]) {
  let source = DEFAULT_SOURCE;
  let test = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--test") test = true;
    else if (argv[i] === "--source") source = argv[++i] ?? source;
  }
  return { source, test };
}

// ----------------------------------------------------------------------------
// File walking + skip rules
// ----------------------------------------------------------------------------
function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

type FrontMatter = {
  type?: string;
  tags?: unknown;
  audience?: unknown;
  exclude_from_rag?: boolean;
  visibility?: string;
};

/** Returns a skip reason string, or null if the file should be ingested. */
function skipReason(name: string, fm: FrontMatter): string | null {
  if (name.startsWith("_private")) return "private file (_private prefix)";
  if (name.startsWith("_chatbot-instructions"))
    return "system prompt, not RAG content";
  // Convention: any underscore-prefixed file is meta/index, not visitor content
  // (covers _MASTER.md, which has no exclude flag but is a dev tracker).
  if (name.startsWith("_")) return "meta/index file (underscore prefix)";
  if (fm.exclude_from_rag === true) return "frontmatter exclude_from_rag: true";
  if (fm.visibility === "PRIVATE" || fm.visibility === "developer-only")
    return `frontmatter visibility: ${fm.visibility}`;
  return null;
}

// ----------------------------------------------------------------------------
// Chunking
// ----------------------------------------------------------------------------
function cleanHeading(line: string): string {
  return line.replace(/^#+\s*/, "").replace(/\s*#+\s*$/, "").trim();
}

/**
 * Split text into blocks that each begin with a heading of the given marker
 * ("##" or "###"). Any text before the first such heading becomes block[0].
 */
function splitByHeading(text: string, marker: "##" | "###"): string[] {
  const re = new RegExp(`^${marker} `);
  const blocks: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (re.test(line) && current.some((l) => l.trim())) {
      blocks.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

/** Greedily pack paragraphs into chunks up to maxChars; hard-split giants. */
function packParagraphs(text: string, maxChars: number): string[] {
  const out: string[] = [];
  let buf = "";
  for (const para of text.split(/\n{2,}/)) {
    if (!para.trim()) continue;
    if (para.length > maxChars) {
      if (buf) {
        out.push(buf);
        buf = "";
      }
      for (let i = 0; i < para.length; i += maxChars)
        out.push(para.slice(i, i + maxChars));
      continue;
    }
    if (buf && buf.length + para.length + 2 > maxChars) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${para}` : para;
  }
  if (buf) out.push(buf);
  return out;
}

interface RawChunk {
  heading: string;
  text: string;
}

/**
 * Section-level chunking: split per "## heading"; sub-split sections over
 * MAX_TOKENS by "### subheading" then by paragraph. Returns {heading, text}.
 */
function chunkMarkdown(body: string): RawChunk[] {
  const h1 = body.split("\n").find((l) => /^# /.test(l));
  const h1Title = h1 ? cleanHeading(h1) : "Intro";

  const chunks: RawChunk[] = [];
  for (const section of splitByHeading(body, "##")) {
    const text = section.trim();
    if (!text) continue;
    const firstLine = text.split("\n", 1)[0] ?? "";
    const heading = /^## /.test(firstLine) ? cleanHeading(firstLine) : h1Title;

    if (estTokens(text) <= MAX_TOKENS) {
      chunks.push({ heading, text });
      continue;
    }
    // Section too large → try H3, then paragraph packing.
    const subs = splitByHeading(text, "###");
    const parts = subs.length > 1 ? subs : [text];
    for (const part of parts) {
      const pt = part.trim();
      if (!pt) continue;
      if (estTokens(pt) <= MAX_TOKENS) chunks.push({ heading, text: pt });
      else
        for (const packed of packParagraphs(pt, MAX_CHARS))
          chunks.push({ heading, text: packed.trim() });
    }
  }
  return chunks.filter((c) => c.text.length >= MIN_CHARS);
}

// ----------------------------------------------------------------------------
// Gemini call wrapper: 200ms spacing + retry/backoff (survives free-tier 429s)
// ----------------------------------------------------------------------------
/** Parse the server's suggested retry delay (seconds) from a 429 message. */
function parseRetrySeconds(msg: string): number | null {
  const m =
    msg.match(/retry in (\d+(?:\.\d+)?)s/i) ?? msg.match(/retryDelay"?:\s*"?(\d+)s/i);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

async function geminiCall<T>(
  fn: () => Promise<T>,
  label: string,
  opts: { maxAttempts?: number; maxBackoffMs?: number } = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 6;
  const maxBackoffMs = opts.maxBackoffMs ?? 65000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      await sleep(RATE_LIMIT_MS);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = /429|quota|rate|exhaust/i.test(msg);
      const retryable =
        isQuota || /unavailable|50\d|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
      if (attempt < maxAttempts && retryable) {
        // Honor the server's retryDelay on quota errors; fall back to exponential
        // backoff otherwise. Capped at maxBackoffMs (small for best-effort calls).
        const hinted = isQuota ? parseRetrySeconds(msg) : null;
        const backoff = Math.min(
          hinted ? (hinted + 1) * 1000 : (isQuota ? 5000 : 800) * attempt,
          maxBackoffMs,
        );
        console.warn(
          `    ⚠ ${label} attempt ${attempt}/${maxAttempts} (${isQuota ? "quota" : "transient"}) — retry in ${Math.round(backoff / 1000)}s`,
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: exhausted retries`);
}

// Synthetic-question generation is best-effort. Free-tier generateContent quota
// is small and PER-MODEL, so we rotate across models when one is exhausted and
// fall back to content-only ingestion when all are exhausted. Content chunks use
// the separate embedding quota and are always ingested.
const SYNTH_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];
let synthModelIdx = 0;
let synthDisabledLogged = false;

async function trySyntheticQuestions(text: string): Promise<string[]> {
  while (synthModelIdx < SYNTH_MODELS.length) {
    const model = SYNTH_MODELS[synthModelIdx];
    try {
      return await geminiCall(
        () => generateSyntheticQuestions(text, model),
        `syntheticQ[${model}]`,
        { maxAttempts: 2, maxBackoffMs: 3000 },
      );
    } catch {
      console.warn(`\n    ⚠ ${model} exhausted for synthetic Q → rotating model`);
      synthModelIdx++;
    }
  }
  if (!synthDisabledLogged) {
    synthDisabledLogged = true;
    console.warn(
      "\n    ⚠ All synthetic-Q models exhausted — ingesting CONTENT chunks only for the rest of this run.",
    );
  }
  return [];
}

// pgvector accepts its text format "[a,b,c]" — JSON.stringify(number[]) matches.
const toVector = (v: number[]) => JSON.stringify(v);

interface ChunkRow {
  id: string;
  content: string;
  embedding: string;
  metadata: Record<string, unknown>;
  file_source: string;
  chunk_type: "content" | "synthetic_q";
  parent_id: string | null;
}

async function insertInBatches(rows: ChunkRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await supabaseAdmin.from("chunks").insert(batch);
    if (error) throw new Error(`insert failed: ${error.message}`);
  }
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  const { source, test } = parseArgs(process.argv.slice(2));

  console.log("=".repeat(64));
  console.log(`RAG ingest  |  mode: ${test ? "TEST (single file)" : "FULL"}`);
  console.log(`source: ${source}`);
  console.log("Note: existing rows are deleted per file_source before insert.");
  console.log("=".repeat(64));

  let files = walkMarkdown(source);
  if (test) {
    const bio = files.find((f) => basename(f).toLowerCase() === "bio.md");
    files = bio ? [bio] : files.slice(0, 1);
  }

  const stats = {
    filesProcessed: 0,
    contentChunks: 0,
    syntheticQ: 0,
    skipped: [] as { file: string; reason: string }[],
    errors: [] as { file: string; error: string }[],
  };

  for (const fullPath of files) {
    const fileSource = relative(source, fullPath).split("\\").join("/");
    const name = basename(fullPath);

    let parsed: matter.GrayMatterFile<string>;
    try {
      parsed = matter(readFileSync(fullPath, "utf8"));
    } catch (err) {
      stats.errors.push({ file: fileSource, error: `parse: ${String(err)}` });
      continue;
    }
    const fm = parsed.data as FrontMatter;

    const reason = skipReason(name, fm);
    if (reason) {
      stats.skipped.push({ file: fileSource, reason });
      console.log(`SKIP  ${fileSource}  (${reason})`);
      continue;
    }

    const rawChunks = chunkMarkdown(parsed.content);
    if (rawChunks.length === 0) {
      stats.skipped.push({ file: fileSource, reason: "no chunks produced" });
      console.log(`SKIP  ${fileSource}  (no chunks produced)`);
      continue;
    }

    console.log(`\nINGEST ${fileSource}  → ${rawChunks.length} chunk(s)`);

    try {
      // Idempotent: clear any prior rows for this file so re-runs don't dup.
      const { error: delErr } = await supabaseAdmin
        .from("chunks")
        .delete()
        .eq("file_source", fileSource);
      if (delErr) throw new Error(`delete old rows: ${delErr.message}`);

      const tags = Array.isArray(fm.tags) ? fm.tags : [];
      const audience = Array.isArray(fm.audience) ? fm.audience : [];
      const rows: ChunkRow[] = [];

      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i];
        const metadata = {
          file_source: fileSource,
          original_chunk_type: fm.type ?? null,
          tags,
          audience,
          section_heading: chunk.heading,
        };

        const contentId = randomUUID();
        const contentEmbedding = await geminiCall(
          () => embed(chunk.text),
          "embed(content)",
        );
        rows.push({
          id: contentId,
          content: chunk.text,
          embedding: toVector(contentEmbedding),
          metadata,
          file_source: fileSource,
          chunk_type: "content",
          parent_id: null,
        });
        stats.contentChunks++;

        const questions = await trySyntheticQuestions(chunk.text);
        for (const q of questions.slice(0, SYNTHETIC_Q_COUNT)) {
          const qEmbedding = await geminiCall(() => embed(q), "embed(question)");
          rows.push({
            id: randomUUID(),
            content: q,
            embedding: toVector(qEmbedding),
            metadata,
            file_source: fileSource,
            chunk_type: "synthetic_q",
            parent_id: contentId,
          });
          stats.syntheticQ++;
        }
        process.stdout.write(
          `  chunk ${i + 1}/${rawChunks.length} "${chunk.heading.slice(0, 40)}" (+${questions.length} Q)\r`,
        );
      }

      await insertInBatches(rows);
      stats.filesProcessed++;
      console.log(`\n  ✓ inserted ${rows.length} rows for ${fileSource}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stats.errors.push({ file: fileSource, error: msg });
      console.error(`\n  ✗ ERROR on ${fileSource}: ${msg}`);
    }
  }

  // --------------------------------------------------------------------------
  // Report
  // --------------------------------------------------------------------------
  console.log("\n" + "=".repeat(64));
  console.log("INGEST REPORT");
  console.log("=".repeat(64));
  console.log(`Files processed (ingested): ${stats.filesProcessed}`);
  console.log(`Content chunks stored:      ${stats.contentChunks}`);
  console.log(`Synthetic questions stored: ${stats.syntheticQ}`);
  console.log(`Total rows stored:          ${stats.contentChunks + stats.syntheticQ}`);
  console.log(`\nSkipped (${stats.skipped.length}):`);
  for (const s of stats.skipped) console.log(`  - ${s.file}  →  ${s.reason}`);
  console.log(`\nErrors (${stats.errors.length}):`);
  for (const e of stats.errors) console.log(`  - ${e.file}  →  ${e.error}`);
  console.log("=".repeat(64));

  if (stats.errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
