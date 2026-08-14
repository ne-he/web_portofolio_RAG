import "./load-env"; // MUST be first: populates process.env before supabase/gemini load.

import { randomUUID } from "node:crypto";

import { embed, generateSyntheticQuestions } from "../src/lib/gemini";
import { supabaseAdmin } from "../src/lib/supabase";

/**
 * Backfill synthetic questions for content chunks that have none.
 *
 * WHY THIS EXISTS, AND WHY NOT JUST RE-RUN INGEST
 * ----------------------------------------------
 * `ingest.ts` deletes every row for a file before reinserting it. Free-tier
 * generateContent quota is ~20 requests/day per model, so a full ingest reliably
 * dies partway through, and whatever it had already deleted stays deleted. The
 * 10 Aug 2026 run ended with 13 files holding content but zero `synthetic_q`,
 * three of which HAD questions before the run. Re-running ingest to fix that can
 * make it worse, and because ingest walks files alphabetically it starves the
 * same `projects/` folder every time.
 *
 * This script never deletes and never touches `content` rows. It reads which
 * chunks are missing questions, fills as many as the day's quota allows, and
 * stops cleanly. Run it again tomorrow and it picks up exactly where it left
 * off, because "what's missing" is recomputed from the database each run.
 *
 *   npx tsx scripts/backfill-synthetic-q.ts              # fill everything missing
 *   npx tsx scripts/backfill-synthetic-q.ts --limit 40   # cap chunks this run
 *   npx tsx scripts/backfill-synthetic-q.ts --dry-run    # report only, no writes
 */

const SYNTHETIC_Q_COUNT = 3;
const RATE_LIMIT_MS = 200; // min spacing between Gemini API calls
const INSERT_BATCH = 10;
const PAGE = 1000; // Supabase caps a single select; page through explicitly

// Same rotation as ingest.ts: generateContent quota is per-model, so when one is
// exhausted the next still has budget. Ordered cheapest-first because synthetic
// questions are bulk work where quantity beats polish.
const SYNTH_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ContentRow {
  id: string;
  content: string;
  file_source: string;
  metadata: Record<string, unknown> | null;
}

function parseArgs(argv: string[]) {
  let limit = Infinity;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") dryRun = true;
    else if (argv[i] === "--limit") limit = Number(argv[++i]) || Infinity;
  }
  return { limit, dryRun };
}

/** Page through a table column-selection until fewer than PAGE rows come back. */
async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Retry wrapper: honours the server's retryDelay hint on 429s. */
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
  const maxAttempts = opts.maxAttempts ?? 4;
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
        const hinted = isQuota ? parseRetrySeconds(msg) : null;
        const backoff = Math.min(
          hinted ? (hinted + 1) * 1000 : (isQuota ? 5000 : 800) * attempt,
          maxBackoffMs,
        );
        console.warn(
          `    ⚠ ${label} attempt ${attempt}/${maxAttempts} (${isQuota ? "quota" : "transient"}), retry in ${Math.round(backoff / 1000)}s`,
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label}: exhausted retries`);
}

let synthModelIdx = 0;

/** Returns questions, or null when every model is out of quota (caller stops). */
async function trySyntheticQuestions(text: string): Promise<string[] | null> {
  while (synthModelIdx < SYNTH_MODELS.length) {
    const model = SYNTH_MODELS[synthModelIdx];
    try {
      return await geminiCall(
        () => generateSyntheticQuestions(text, model),
        `syntheticQ[${model}]`,
        { maxAttempts: 2, maxBackoffMs: 3000 },
      );
    } catch {
      console.warn(`    ⚠ ${model} exhausted → rotating model`);
      synthModelIdx++;
    }
  }
  return null;
}

const toVector = (v: number[]) => JSON.stringify(v);

async function main() {
  const { limit, dryRun } = parseArgs(process.argv.slice(2));

  console.log("=".repeat(64));
  console.log(`BACKFILL synthetic_q  |  mode: ${dryRun ? "DRY RUN" : "WRITE"}`);
  console.log("Content rows are never read-modified or deleted by this script.");
  console.log("=".repeat(64));

  // 1. Which content chunks already have questions?
  const parents = await selectAll<{ parent_id: string | null }>((from, to) =>
    supabaseAdmin
      .from("chunks")
      .select("parent_id")
      .eq("chunk_type", "synthetic_q")
      .range(from, to),
  );
  const covered = new Set(parents.map((p) => p.parent_id).filter(Boolean) as string[]);

  // 2. All content chunks.
  const contents = await selectAll<ContentRow>((from, to) =>
    supabaseAdmin
      .from("chunks")
      .select("id, content, file_source, metadata")
      .eq("chunk_type", "content")
      .order("file_source", { ascending: true })
      .range(from, to),
  );

  const missing = contents.filter((c) => !covered.has(c.id));

  // 3. Report the gap per file before touching anything.
  const perFile = new Map<string, { total: number; missing: number }>();
  for (const c of contents) {
    const e = perFile.get(c.file_source) ?? { total: 0, missing: 0 };
    e.total++;
    if (!covered.has(c.id)) e.missing++;
    perFile.set(c.file_source, e);
  }
  console.log(`\nContent chunks : ${contents.length}`);
  console.log(`Already covered: ${contents.length - missing.length}`);
  console.log(`Missing        : ${missing.length}\n`);
  for (const [file, e] of [...perFile].sort((a, b) => b[1].missing - a[1].missing)) {
    if (e.missing > 0) console.log(`  ${String(e.missing).padStart(3)} / ${String(e.total).padEnd(3)} missing  ${file}`);
  }

  if (dryRun || missing.length === 0) {
    console.log(`\n${dryRun ? "Dry run, nothing written." : "Nothing to backfill."}`);
    return;
  }

  // 4. Process the most-starved files first. A file with zero questions is
  //    invisible to conversational queries; a file missing one of four is not.
  //    If quota runs out mid-run, this ordering means it ran out on the chunks
  //    that mattered least, the opposite of what alphabetical ingest does.
  const rank = (f: string) => {
    const e = perFile.get(f)!;
    return e.missing / e.total;
  };
  const queue = [...missing]
    .sort((a, b) => rank(b.file_source) - rank(a.file_source))
    .slice(0, limit === Infinity ? undefined : limit);

  console.log(`\nBackfilling ${queue.length} chunk(s)...\n`);

  const pending: Record<string, unknown>[] = [];
  const stats = { chunksDone: 0, questions: 0, stoppedOnQuota: false };

  const flush = async () => {
    while (pending.length) {
      const batch = pending.splice(0, INSERT_BATCH);
      const { error } = await supabaseAdmin.from("chunks").insert(batch);
      if (error) throw new Error(`insert failed: ${error.message}`);
    }
  };

  for (const chunk of queue) {
    const questions = await trySyntheticQuestions(chunk.content);
    if (questions === null) {
      stats.stoppedOnQuota = true;
      console.log("\n  ⚠ All models out of quota, stopping cleanly.");
      break;
    }
    for (const q of questions.slice(0, SYNTHETIC_Q_COUNT)) {
      const qEmbedding = await geminiCall(() => embed(q), "embed(question)");
      pending.push({
        id: randomUUID(),
        content: q,
        embedding: toVector(qEmbedding),
        metadata: chunk.metadata ?? { file_source: chunk.file_source },
        file_source: chunk.file_source,
        chunk_type: "synthetic_q",
        parent_id: chunk.id,
      });
      stats.questions++;
    }
    stats.chunksDone++;
    // Flush as we go: a crash or quota death should not throw away work already
    // paid for in API calls.
    if (pending.length >= INSERT_BATCH) await flush();
    process.stdout.write(
      `  ${stats.chunksDone}/${queue.length} chunks, ${stats.questions} questions  (${chunk.file_source})          \r`,
    );
  }
  await flush();

  console.log("\n\n" + "=".repeat(64));
  console.log("BACKFILL REPORT");
  console.log("=".repeat(64));
  console.log(`Chunks backfilled  : ${stats.chunksDone} / ${queue.length}`);
  console.log(`Questions inserted : ${stats.questions}`);
  console.log(`Still missing after: ${missing.length - stats.chunksDone}`);
  if (stats.stoppedOnQuota) {
    console.log("\nStopped on quota, not on error. Run this again tomorrow;");
    console.log("it recomputes what is missing, so nothing is redone or lost.");
  }
  console.log("=".repeat(64));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
