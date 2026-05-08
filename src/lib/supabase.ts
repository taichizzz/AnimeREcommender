import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set");
  }
}

export const supabase = createClient(url ?? "", key ?? "", {
  auth: { persistSession: false },
});

// ── Types matching the `anime` table in schema.sql ──────────────────────────

export type AnimeRow = {
  id: number;
  mal_id: number | null;
  title: string;
  title_english: string | null;
  synopsis: string | null;
  cover_url: string | null;
  year: number | null;
  avg_score: number | null;
  genres: string[];
};

export type AnimeMatch = AnimeRow & { similarity: number };

// Fetch just title + synopsis for seed anime (used in LLM prompts).
export async function getAnimeBasicsByMalIds(
  malIds: number[]
): Promise<{ mal_id: number; title: string; title_english: string | null }[]> {
  if (malIds.length === 0) return [];
  const { data, error } = await supabase
    .from("anime")
    .select("mal_id, title, title_english")
    .in("mal_id", malIds);
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data ?? []) as { mal_id: number; title: string; title_english: string | null }[];
}

export type AnimeTagsRow = {
  id: number;
  tags: { name: string; rank: number }[];
  episodes: number | null;
  synopsis: string | null;
};

// Fetch tags + episodes + full synopsis for the top candidates (richer context for Groq).
export async function getAnimeRichDataByIds(ids: number[]): Promise<Map<number, AnimeTagsRow>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("anime")
    .select("id, tags, episodes, synopsis")
    .in("id", ids);
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  const map = new Map<number, AnimeTagsRow>();
  for (const row of data ?? []) map.set(row.id, row as AnimeTagsRow);
  return map;
}

// pgvector serializes/deserializes vectors as either string "[1,2,3]" or array.
type EmbeddingValue = string | number[];

function parseEmbedding(v: EmbeddingValue | null): number[] | null {
  if (v == null) return null;
  if (typeof v === "string") {
    // "[1.0, 2.0, ...]" → number[]
    return JSON.parse(v) as number[];
  }
  return v;
}

// ── Compute weighted user vector from liked anime + scores ─────────────────
// score = 10 → +3.5  (strong positive pull)
// score = 7  → +0.5  (mild positive)
// score = 5  → -1.5  (mild negative)
// score = 1  → -5.5  (strong negative — push away)
//
// We center on 6.5 because that's roughly the midpoint of MAL ratings in practice.

function computeUserVector(
  liked: { embedding: number[]; score: number }[],
  dim: number
): number[] | null {
  if (liked.length === 0) return null;

  const vec = new Array(dim).fill(0);
  for (const { embedding, score } of liked) {
    const weight = score - 6.5;
    for (let i = 0; i < dim; i++) {
      vec[i] += embedding[i] * weight;
    }
  }
  return vec;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function matchAnimeForUser(opts: {
  likedMalIds: number[];
  likedScores: number[];           // same length as likedMalIds
  excludeMalIds?: number[];
  allowedFormats?: string[];       // default ['TV', 'MOVIE'] — excludes OVA/ONA/SPECIAL noise
  matchCount?: number;
}): Promise<AnimeMatch[]> {
  const {
    likedMalIds,
    likedScores,
    excludeMalIds = [],
    allowedFormats = ["TV", "MOVIE"],
    matchCount = 10,
  } = opts;

  // 1) Fetch embeddings of the user's liked anime
  const { data: rows, error: fetchErr } = await supabase
    .from("anime")
    .select("mal_id, embedding")
    .in("mal_id", likedMalIds);

  if (fetchErr) throw new Error(`Supabase fetch failed: ${fetchErr.message}`);
  if (!rows || rows.length === 0) {
    throw new Error("None of your liked anime are in the index yet");
  }

  // 2) Pair each row with its score (some MAL IDs may be missing from index)
  const scoreByMal = new Map<number, number>();
  likedMalIds.forEach((id, i) => scoreByMal.set(id, likedScores[i]));

  const liked: { embedding: number[]; score: number }[] = [];
  let dim = 0;
  for (const r of rows) {
    const emb = parseEmbedding(r.embedding as EmbeddingValue);
    if (!emb || r.mal_id == null) continue;
    const score = scoreByMal.get(r.mal_id);
    if (score == null) continue;
    liked.push({ embedding: emb, score });
    dim = emb.length;
  }

  // 3) Compute weighted user vector
  const userVec = computeUserVector(liked, dim);
  if (!userVec) throw new Error("Could not build user vector (no overlap with index)");

  // 4) Call the pgvector RPC for nearest-neighbor search.
  //    Always exclude the seed anime themselves — they'd otherwise score
  //    100% similar and dominate the results.
  const fullExclude = Array.from(new Set([...excludeMalIds, ...likedMalIds]));

  const { data, error } = await supabase.rpc("match_anime", {
    query_vec: userVec,
    exclude_mal_ids: fullExclude,
    allowed_formats: allowedFormats,
    match_count: matchCount,
  });

  if (error) throw new Error(`Supabase RPC failed: ${error.message}`);
  return (data ?? []) as AnimeMatch[];
}
