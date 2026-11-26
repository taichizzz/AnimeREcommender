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

export type UserFeedbackSignals = {
  likedIds: number[];
  dislikedIds: number[];
  excludedIds: number[];
};

/**
 * Fetches persisted user feedback signals (`up`, `down`, `not_interested`)
 * from the `feedback` table. Gracefully returns empty arrays on any error
 * so recommendations never break if the table is missing or unreachable.
 */
export async function getUserFeedback(userKey: string): Promise<UserFeedbackSignals> {
  const empty: UserFeedbackSignals = { likedIds: [], dislikedIds: [], excludedIds: [] };
  if (!userKey) return empty;
  try {
    const { data, error } = await supabase
      .from("feedback")
      .select("anime_mal_id, signal")
      .eq("user_key", userKey);
    if (error || !data) return empty;

    const likedIds: number[] = [];
    const dislikedIds: number[] = [];
    const excludedIds: number[] = [];

    for (const row of data) {
      const malId = row.anime_mal_id;
      if (typeof malId !== "number" || !Number.isFinite(malId)) continue;
      if (row.signal === "up") {
        likedIds.push(malId);
      } else if (row.signal === "down") {
        dislikedIds.push(malId);
        excludedIds.push(malId);
      } else if (row.signal === "not_interested") {
        excludedIds.push(malId);
      }
    }

    return { likedIds, dislikedIds, excludedIds };
  } catch {
    return empty;
  }
}

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
// Uses per-user mean centering for sufficiently large & varied rating lists
// (falls back to 6.5 for small manual lists or flat all-10 lists), boosts the
// user's selected favorite, applies explicit feedback nudges, and guards
// against near-zero vectors before pgvector cosine distance.

function computeUserVector(
  liked: { malId: number; embedding: number[]; score: number }[],
  dim: number,
  opts?: {
    favoriteMalId?: number;
    feedbackUp?: number[][];
    feedbackDown?: number[][];
  }
): number[] | null {
  if (liked.length === 0) return null;

  let minScore = Infinity;
  let maxScore = -Infinity;
  let sumScore = 0;
  for (const { score } of liked) {
    if (score < minScore) minScore = score;
    if (score > maxScore) maxScore = score;
    sumScore += score;
  }
  const meanScore = sumScore / liked.length;
  const center =
    liked.length >= 6 && maxScore - minScore >= 2
      ? Math.min(8.5, Math.max(4.0, meanScore))
      : 6.5;

  const vec = new Array(dim).fill(0);
  for (const { malId, embedding, score } of liked) {
    let weight = score - center;
    if (opts?.favoriteMalId != null && malId === opts.favoriteMalId) {
      weight = Math.max(weight, 1.5) * 1.5;
    }
    for (let i = 0; i < dim; i++) {
      vec[i] += embedding[i] * weight;
    }
  }

  for (const emb of opts?.feedbackUp ?? []) {
    for (let i = 0; i < dim; i++) {
      vec[i] += 1.5 * emb[i];
    }
  }

  for (const emb of opts?.feedbackDown ?? []) {
    for (let i = 0; i < dim; i++) {
      vec[i] -= 2.0 * emb[i];
    }
  }

  // Zero-vector safety guard so pgvector cosine distance never divides by zero
  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    normSq += vec[i] * vec[i];
  }
  if (normSq < 1e-8) {
    vec.fill(0);
    for (const { embedding } of liked) {
      for (let i = 0; i < dim; i++) {
        vec[i] += embedding[i];
      }
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
  useCF?: boolean;                 // true = collaborative filtering, false = synopsis embeddings
  favoriteMalId?: number;
  feedbackUpMalIds?: number[];
  feedbackDownMalIds?: number[];
}): Promise<AnimeMatch[]> {
  const {
    likedMalIds,
    likedScores,
    excludeMalIds = [],
    allowedFormats = ["TV", "MOVIE"],
    matchCount = 10,
    useCF = false,
    favoriteMalId,
    feedbackUpMalIds = [],
    feedbackDownMalIds = [],
  } = opts;

  const embeddingColumn = useCF ? "cf_embedding" : "embedding";
  const rpcName = useCF ? "match_anime_cf" : "match_anime";

  const allFetchIds = Array.from(
    new Set([...likedMalIds, ...feedbackUpMalIds, ...feedbackDownMalIds])
  );

  // 1) Fetch embeddings of the user's liked anime + feedback items
  const { data: rows, error: fetchErr } = await supabase
    .from("anime")
    .select(`mal_id, ${embeddingColumn}`)
    .in("mal_id", allFetchIds);

  if (fetchErr) throw new Error(`Supabase fetch failed: ${fetchErr.message}`);
  if (!rows || rows.length === 0) {
    throw new Error(
      useCF
        ? "None of your liked anime are in the CF index yet — they need to be popular enough to appear in the Kaggle dataset"
        : "None of your liked anime are in the index yet"
    );
  }

  // 2) Pair each row with its score (some MAL IDs may be missing from index)
  const embByMal = new Map<number, number[]>();
  for (const r of rows) {
    const rawEmb = (r as Record<string, unknown>)[embeddingColumn] as EmbeddingValue | null;
    const emb = parseEmbedding(rawEmb);
    if (!emb || r.mal_id == null) continue;
    embByMal.set(r.mal_id, emb);
  }

  const likedSet = new Set(likedMalIds);
  const scoreByMal = new Map<number, number>();
  likedMalIds.forEach((id, i) => scoreByMal.set(id, likedScores[i]));

  const liked: { malId: number; embedding: number[]; score: number }[] = [];
  let dim = 0;
  for (const [malId, score] of scoreByMal.entries()) {
    const emb = embByMal.get(malId);
    if (!emb) continue;
    liked.push({ malId, embedding: emb, score });
    dim = emb.length;
  }

  // Exclude likedMalIds from feedbackUp to avoid double-counting
  const feedbackUp: number[][] = [];
  for (const id of new Set(feedbackUpMalIds)) {
    if (likedSet.has(id)) continue;
    const emb = embByMal.get(id);
    if (emb && emb.length === dim) feedbackUp.push(emb);
  }

  const feedbackDown: number[][] = [];
  for (const id of new Set(feedbackDownMalIds)) {
    const emb = embByMal.get(id);
    if (emb && emb.length === dim) feedbackDown.push(emb);
  }

  // 3) Compute weighted user vector
  const userVec = computeUserVector(liked, dim, {
    favoriteMalId,
    feedbackUp,
    feedbackDown,
  });
  if (!userVec) throw new Error("Could not build user vector (no overlap with index)");

  // 4) Call the pgvector RPC for nearest-neighbor search.
  //    Always exclude the seed anime themselves — they'd otherwise score
  //    100% similar and dominate the results.
  const fullExclude = Array.from(
    new Set([...excludeMalIds, ...likedMalIds, ...feedbackDownMalIds])
  );

  const { data, error } = await supabase.rpc(rpcName, {
    query_vec: userVec,
    exclude_mal_ids: fullExclude,
    allowed_formats: allowedFormats,
    match_count: matchCount,
  });

  if (error) throw new Error(`Supabase RPC failed: ${error.message}`);
  return (data ?? []) as AnimeMatch[];
}
