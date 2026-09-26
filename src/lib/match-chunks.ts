import { supabasePublic } from "./supabase";

export interface MatchedChunk {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
  file_source: string;
  chunk_type: string;
  parent_id: string | null;
  /** True when the chunk was pulled in because the question names its topic. */
  pinned?: boolean;
}

// Pinning. Pure similarity search loses named projects in two cases found in the
// 25 Sep 2026 audit: an English question ("What is VERDICT ANALYST and where is
// the demo?") scored Indonesian "where is the demo" questions of OTHER projects
// higher than VERDICT's own chunks, and "list all live projects" came back with
// 2 or 3 random project chunks instead of the index. When the question names a
// project (or the contact topic), its best chunk is pinned into the context. When
// it asks for a list, the project index is pinned.
const INDEX_FILE = "projects/README.md";
const PINS: { pattern: RegExp; file: string }[] = [
  { pattern: /verdict/i, file: "projects/verdict-analyst.md" },
  { pattern: /fin ?sight/i, file: "projects/finsight.md" },
  { pattern: /kenneth/i, file: "projects/kenneth.md" },
  { pattern: /\bpulse\b/i, file: "projects/pulse.md" },
  { pattern: /phish|url detect/i, file: "projects/phishguard-url-detector.md" },
  { pattern: /iceberg/i, file: "projects/iceberg-web-cv.md" },
  { pattern: /armou?ry|nemi'?s garage/i, file: "projects/armory-hall.md" },
  { pattern: /feature ?(store|shop)/i, file: "projects/feature-store-mvp.md" },
  { pattern: /suara rakyat|\bigar\b/i, file: "projects/suara-rakyat.md" },
  { pattern: /e-?commerce|nemi-dashboard|sales analysis|analisis penjualan/i, file: "projects/ecommerce-dashboard.md" },
  { pattern: /nemvision|waste|sampah|trash ?net|image classif/i, file: "projects/image-classification.md" },
  { pattern: /addict|kecanduan|\bsinyal\b/i, file: "projects/phone-addiction-prediction.md" },
  { pattern: /family|partai wilhelmus|todo ?list|task board/i, file: "projects/family-todolist.md" },
  { pattern: /clash|hci lab/i, file: "projects/hci-lab.md" },
  { pattern: /simple ?notes|swift ?ui/i, file: "projects/simplenotes.md" },
  { pattern: /ask nemi|(chat)?bot ini|this (chat)?bot|web_portofolio_rag/i, file: "projects/ask-nemi.md" },
  { pattern: /besi ?kita|bengkel/i, file: "projects/besikita-bengkel.md" },
  { pattern: /churn|credit|kredit|gym|workout|second brain/i, file: "projects/smaller-builds.md" },
  { pattern: /linkedin|kontak|contact|hubungi|reach (him|nemi|out)|e-?mail|whats ?app|instagram/i, file: "bio.md" },
];
const LIST_INTENT =
  /\b(semua|all|daftar|list|sebut(in|kan)|apa (aja|saja)|which|what)\b.{0,50}\b(projek|proyek|projects?|demo|portfolio|portofolio|karya)|\b(projek|proyek|projects?)\b.{0,40}\b(apa (aja|saja)|yang (udah|sudah) live|live)\b/i;
const MAX_PINNED_FILES = 3;
const PER_PINNED_FILE = 3;

/** pgvector comes back from PostgREST as the text "[a,b,...]". */
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  return typeof v === "string" ? (JSON.parse(v) as number[]) : [];
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

function pinnedFiles(queryText: string): string[] {
  const files = PINS.filter((p) => p.pattern.test(queryText)).map((p) => p.file);
  if (LIST_INTENT.test(queryText)) files.unshift(INDEX_FILE);
  return [...new Set(files)].slice(0, MAX_PINNED_FILES);
}

/**
 * Retrieve the most relevant chunks for a query via the `match_chunks` RPC
 * (hybrid vector + keyword search), then resolve synthetic-question hits back
 * to their parent CONTENT chunk here in TS.
 *
 * PENTING: RPC-nya sendiri TIDAK me-resolve synthetic → parent (diverifikasi
 * empiris 2026-07-20: rows keluar dengan chunk_type "synthetic_q" dan content
 * berupa teks pertanyaannya). Tanpa resolusi, konteks yang dikirim ke model
 * bisa berisi daftar pertanyaan tanpa fakta: sumber halusinasi di eval run
 * pertama. Makanya kita over-fetch, tukar synthetic dengan parent-nya, dedupe,
 * lalu potong ke matchCount (plus chunk yang di-pin, lihat PINS di atas).
 *
 * @param queryEmbedding 768-dim query vector (from gemini.embed)
 * @param queryText      raw query text (for the keyword/tsvector side and pinning)
 * @param matchCount     max rows to return, not counting pinned chunks
 */
export async function matchChunks(
  queryEmbedding: number[],
  queryText: string,
  matchCount = 5,
): Promise<MatchedChunk[]> {
  const pins = pinnedFiles(queryText);
  const { data, error } = await supabasePublic.rpc("match_chunks", {
    // pgvector accepts its text form "[a,b,c]"; JSON.stringify(number[]) matches.
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: queryText,
    // over-fetch: dedupe sesudah resolusi bisa menciutkan hasil, dan chunk yang
    // di-pin sering ada di luar 15 besar
    match_count: pins.length ? 60 : matchCount * 3,
  });
  if (error) throw new Error(`match_chunks RPC failed: ${error.message}`);
  const raw = (data ?? []) as MatchedChunk[];

  // Ambil parent content untuk semua hit synthetic dalam satu query.
  const parentIds = [
    ...new Set(
      raw
        .filter((c) => c.chunk_type === "synthetic_q" && c.parent_id)
        .map((c) => c.parent_id as string),
    ),
  ];
  const parents = new Map<string, { content: string; file_source: string }>();
  if (parentIds.length > 0) {
    const { data: parentRows, error: parentErr } = await supabasePublic
      .from("chunks")
      .select("id, content, file_source")
      .in("id", parentIds);
    if (parentErr) throw new Error(`parent fetch failed: ${parentErr.message}`);
    for (const p of parentRows ?? []) {
      parents.set(p.id as string, {
        content: p.content as string,
        file_source: p.file_source as string,
      });
    }
  }

  // Tukar synthetic → parent, lalu dedupe per chunk konten (skor tertinggi menang;
  // RPC sudah mengurutkan dari yang paling mirip).
  const seen = new Set<string>();
  const pool: MatchedChunk[] = [];
  for (const c of raw) {
    let out = c;
    if (c.chunk_type === "synthetic_q") {
      const parent = c.parent_id ? parents.get(c.parent_id) : undefined;
      if (!parent) continue; // synthetic yatim: tanpa fakta, buang saja
      out = {
        ...c,
        id: c.parent_id as string,
        content: parent.content,
        file_source: parent.file_source,
        chunk_type: "content",
      };
    }
    if (seen.has(out.id)) continue;
    seen.add(out.id);
    pool.push(out);
  }

  // Pinned chunks first. A named file's own content chunks are ranked here by
  // cosine similarity to the question, instead of trusting the RPC to surface
  // them: for some questions the RPC returns only one or two rows in total (seen
  // 26 Sep 2026 with "Waste image classification pakai model apa..."), which
  // left the model without the results table and it made numbers up.
  const result: MatchedChunk[] = [];
  for (const file of pins) {
    const want = file === INDEX_FILE ? 2 : PER_PINNED_FILE;
    const { data: rows } = await supabasePublic
      .from("chunks")
      .select("id, content, file_source, chunk_type, parent_id, metadata, embedding")
      .eq("file_source", file)
      .eq("chunk_type", "content")
      .limit(40);
    let hits = ((rows ?? []) as (Omit<MatchedChunk, "similarity"> & { embedding: unknown })[])
      .map(({ embedding, ...r }) => ({ ...r, similarity: cosine(queryEmbedding, parseVector(embedding)) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, want);
    if (hits.length === 0) hits = pool.filter((c) => c.file_source === file).slice(0, want);
    for (const h of hits) result.push({ ...h, pinned: true });
  }
  const taken = new Set(result.map((c) => c.id));
  let added = 0;
  for (const c of pool) {
    if (added >= matchCount) break;
    if (taken.has(c.id)) continue;
    result.push(c);
    added++;
  }
  return result;
}
