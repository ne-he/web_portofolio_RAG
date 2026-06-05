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
 * (hybrid vector + keyword search). The RPC resolves synthetic-question matches
 * back to their parent content chunk, so results are always `content` rows.
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
    match_count: matchCount,
  });
  if (error) throw new Error(`match_chunks RPC failed: ${error.message}`);
  return (data ?? []) as MatchedChunk[];
}
