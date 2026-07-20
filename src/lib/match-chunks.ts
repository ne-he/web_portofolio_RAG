import { supabasePublic } from "./supabase";

export interface MatchedChunk {
  id: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown> | null;
  file_source: string;
  chunk_type: string;
  parent_id: string | null;
}

/**
 * Retrieve the most relevant chunks for a query via the `match_chunks` RPC
 * (hybrid vector + keyword search), then resolve synthetic-question hits back
 * to their parent CONTENT chunk here in TS.
 *
 * PENTING: RPC-nya sendiri TIDAK me-resolve synthetic → parent (diverifikasi
 * empiris 2026-07-20: rows keluar dengan chunk_type "synthetic_q" dan content
 * berupa teks pertanyaannya). Tanpa resolusi, konteks yang dikirim ke model
 * bisa berisi daftar pertanyaan tanpa fakta — sumber halusinasi di eval run
 * pertama. Makanya kita over-fetch, tukar synthetic dengan parent-nya, dedupe,
 * lalu potong ke matchCount.
 *
 * @param queryEmbedding 768-dim query vector (from gemini.embed)
 * @param queryText      raw query text (for the keyword/tsvector side)
 * @param matchCount     max rows to return
 */
export async function matchChunks(
  queryEmbedding: number[],
  queryText: string,
  matchCount = 5,
): Promise<MatchedChunk[]> {
  const { data, error } = await supabasePublic.rpc("match_chunks", {
    // pgvector accepts its text form "[a,b,c]"; JSON.stringify(number[]) matches.
    query_embedding: JSON.stringify(queryEmbedding),
    query_text: queryText,
    match_count: matchCount * 3, // over-fetch: dedupe sesudah resolusi bisa menciutkan hasil
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
  const resolved: MatchedChunk[] = [];
  for (const c of raw) {
    let out = c;
    if (c.chunk_type === "synthetic_q") {
      const parent = c.parent_id ? parents.get(c.parent_id) : undefined;
      if (!parent) continue; // synthetic yatim — tanpa fakta, buang saja
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
    resolved.push(out);
    if (resolved.length >= matchCount) break;
  }
  return resolved;
}
