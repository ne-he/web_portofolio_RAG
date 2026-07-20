// Eval runner untuk Ask Nemi (peta V2.9 poin 4: bikin test set, ukur kualitas).
//
// Untuk tiap pertanyaan di evals/questions.json:
//   1. Diagnostik retrieval: embed query + matchChunks langsung (top-5 source + similarity)
//   2. Jawaban real: POST ke /api/chat lokal (jalur produksi penuh: gate, leak guard,
//      language reminder), parse SSE, catat latency first-token & total.
// Hasil ke evals/results/run-<tanggal>.json + .md (grading manusia/LLM nyusul di kolom verdict).
//
// Pakai:  npx tsx scripts/run-evals.ts [--base http://localhost:3111]
// Server: jalankan dev server dengan RATE_LIMIT_MAX & DAILY_LIMIT_PER_IP digedein dulu.

import "./load-env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { embed } from "../src/lib/gemini";
import { matchChunks } from "../src/lib/match-chunks";

interface EvalQuestion {
  id: string;
  category: string;
  lang: string;
  question: string;
  expect: string;
  expect_sources: string[];
}

interface RetrievalHit {
  file_source: string;
  chunk_type: string;
  similarity: number;
}

interface EvalResult {
  id: string;
  category: string;
  lang: string;
  question: string;
  expect: string;
  expect_sources: string[];
  retrieval: RetrievalHit[];
  top_sim: number;
  weak_context: boolean; // sama dengan gate di route.ts (top < 0.68)
  answer: string;
  first_token_ms: number;
  total_ms: number;
  error?: string;
  verdict?: string; // diisi saat grading: BENAR | SALAH | NGAWANG | NGELAK
}

const baseIdx = process.argv.indexOf("--base");
const BASE = baseIdx !== -1 ? process.argv[baseIdx + 1] : "http://localhost:3111";
const WEAK_TOP_SIM = 0.68;

// Free tier gemini-2.5-flash = 5 request/menit. Pacing antar-pertanyaan + retry
// saat quota kena, biar 1 run 20 pertanyaan lolos tanpa 429.
const PACE_MS = 13_000;
const MAX_TRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isQuotaError(err: string | undefined): boolean {
  return !!err && (err.includes("429") || err.includes("quota") || err.includes("Quota"));
}

async function askChatbot(question: string): Promise<{
  answer: string;
  first_token_ms: number;
  total_ms: number;
  error?: string;
}> {
  const started = Date.now();
  let firstToken = 0;
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    return {
      answer: "",
      first_token_ms: 0,
      total_ms: Date.now() - started,
      error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
    };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let error: string | undefined;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const ev of events) {
      const line = ev.trim();
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload) as { text?: string; error?: string };
        if (parsed.text) {
          if (!firstToken) firstToken = Date.now() - started;
          answer += parsed.text;
        }
        if (parsed.error) error = parsed.error;
      } catch {
        // potongan JSON kepotong antar-chunk — biarkan, event berikut yang lengkap
      }
    }
  }
  return { answer, first_token_ms: firstToken, total_ms: Date.now() - started, error };
}

async function main() {
  const file = resolve(process.cwd(), "evals/questions.json");
  let { questions } = JSON.parse(readFileSync(file, "utf8")) as {
    questions: EvalQuestion[];
  };
  // --only r1,t3 → jalanin subset doang, hasilnya di-merge ke run file hari ini.
  const onlyIdx = process.argv.indexOf("--only");
  const onlyIds =
    onlyIdx !== -1 ? new Set(process.argv[onlyIdx + 1].split(",")) : null;
  if (onlyIds) questions = questions.filter((q) => onlyIds.has(q.id));
  console.log(`Eval run: ${questions.length} pertanyaan → ${BASE}\n`);

  const results: EvalResult[] = [];
  for (const q of questions) {
    process.stdout.write(`[${q.id}] ${q.question.slice(0, 60)}... `);
    let retrieval: RetrievalHit[] = [];
    try {
      const emb = await embed(q.question);
      retrieval = (await matchChunks(emb, q.question, 5)).map((c) => ({
        file_source: c.file_source,
        chunk_type: c.chunk_type,
        similarity: Math.round(c.similarity * 1000) / 1000,
      }));
    } catch (err) {
      console.log(`retrieval ERROR: ${String(err)}`);
    }
    const top_sim = retrieval[0]?.similarity ?? 0;

    let reply = await askChatbot(q.question);
    for (let attempt = 2; attempt <= MAX_TRIES && isQuotaError(reply.error); attempt++) {
      process.stdout.write(`quota — retry ${attempt}/${MAX_TRIES} in 40s... `);
      await sleep(40_000);
      reply = await askChatbot(q.question);
    }
    results.push({
      ...q,
      retrieval,
      top_sim,
      weak_context: top_sim < WEAK_TOP_SIM,
      ...reply,
    });
    console.log(
      reply.error
        ? `ERROR: ${reply.error.slice(0, 160)}`
        : `ok (top_sim ${top_sim}, first ${reply.first_token_ms}ms, total ${reply.total_ms}ms)`,
    );
    await sleep(PACE_MS);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const outDir = resolve(process.cwd(), "evals/results");
  mkdirSync(outDir, { recursive: true });
  const jsonPath = resolve(outDir, `run-${stamp}.json`);

  // Merge dengan run file hari ini (mode --only ngerjain subset, sisanya dipertahankan).
  let merged = results;
  try {
    const prev = JSON.parse(readFileSync(jsonPath, "utf8")) as EvalResult[];
    const fresh = new Map(results.map((r) => [r.id, r]));
    merged = prev.map((p) => fresh.get(p.id) ?? p);
    for (const r of results) if (!prev.some((p) => p.id === r.id)) merged.push(r);
  } catch {
    // belum ada run hari ini — pakai hasil baru apa adanya
  }
  writeFileSync(jsonPath, JSON.stringify(merged, null, 2), "utf8");

  const md = merged
    .map((r) => {
      const sources = r.retrieval
        .map((h) => `${h.file_source} [${h.chunk_type}] ${h.similarity}`)
        .join("; ");
      return [
        `## ${r.id} (${r.category}, ${r.lang})`,
        `**Q:** ${r.question}`,
        `**Expect:** ${r.expect}`,
        `**Retrieval:** top_sim ${r.top_sim}${r.weak_context ? " (WEAK)" : ""} — ${sources}`,
        `**Latency:** first token ${r.first_token_ms}ms, total ${r.total_ms}ms`,
        r.error ? `**ERROR:** ${r.error}` : "",
        `**A:** ${r.answer}`,
        `**Verdict:** _(belum dinilai)_`,
      ]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n---\n\n");
  const mdPath = resolve(outDir, `run-${stamp}.md`);
  writeFileSync(mdPath, `# Eval run ${stamp}\n\n${md}\n`, "utf8");

  const avgFirst =
    results.filter((r) => r.first_token_ms).reduce((s, r) => s + r.first_token_ms, 0) /
    Math.max(1, results.filter((r) => r.first_token_ms).length);
  const avgTotal =
    results.reduce((s, r) => s + r.total_ms, 0) / Math.max(1, results.length);
  console.log(`\nSelesai. Rata-rata first token ${Math.round(avgFirst)}ms, total ${Math.round(avgTotal)}ms.`);
  console.log(`Hasil: ${jsonPath}\n       ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
