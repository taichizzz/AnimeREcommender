import { NextResponse } from "next/server";
import {
  matchAnimeForUser,
  getAnimeBasicsByMalIds,
  getAnimeRichDataByIds,
  type AnimeMatch,
} from "@/lib/supabase";
import { rerankWithReasons, type CandidateSummary, type QuizSignals } from "@/lib/groq";

// POST body:
//   { likedAnimeIds: number[],          // MAL IDs of seeds
//     likedScores?: number[],
//     excludeMalIds?: number[],
//     userText?: string,
//     favoriteMalId?: number,           // ⭐ favorite from quiz
//     quiz?: { hookedBy?, mood?, dislikes? } }

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

const FINAL_COUNT = 10;
const CANDIDATE_POOL = 50;   // wider pool — we filter by dislikes before sending to Groq
const TO_RERANK = 30;

// Map dislike chips → AniList genre exclusions (case-insensitive)
const DISLIKE_GENRE_MAP: Record<string, string[]> = {
  "Romance focus":   ["Romance"],
  "Sports":          ["Sports"],
  "Slice-of-life":   ["Slice of Life"],
  "Ecchi/fanservice":["Ecchi"],
  "Mecha":           ["Mecha"],
};

function applyDislikeFilters(matches: AnimeMatch[], dislikes: string[]): AnimeMatch[] {
  if (dislikes.length === 0) return matches;

  // Build a Set of forbidden genre names (lowercased) for fast lookup
  const forbidden = new Set<string>();
  for (const d of dislikes) {
    const genres = DISLIKE_GENRE_MAP[d];
    if (genres) genres.forEach((g) => forbidden.add(g.toLowerCase()));
  }

  return matches.filter((m) => {
    const genres = (m.genres ?? []).map((g) => g.toLowerCase());
    return !genres.some((g) => forbidden.has(g));
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const liked = body?.likedAnimeIds;
  const scores = body?.likedScores;
  const exclude = body?.excludeMalIds;
  const favoriteMalId = typeof body?.favoriteMalId === "number" ? body.favoriteMalId : undefined;

  const userText: string | undefined =
    typeof body?.userText === "string" && body.userText.trim().length > 0
      ? body.userText.trim().slice(0, 500)
      : undefined;

  const rawQuiz = body?.quiz;
  const quiz: QuizSignals | undefined = rawQuiz && typeof rawQuiz === "object"
    ? {
        hookedBy:
          typeof rawQuiz.hookedBy === "string" && rawQuiz.hookedBy.trim().length > 0
            ? rawQuiz.hookedBy.trim().slice(0, 200)
            : undefined,
        mood: isStringArray(rawQuiz.mood) ? rawQuiz.mood : undefined,
        dislikes: isStringArray(rawQuiz.dislikes) ? rawQuiz.dislikes : undefined,
      }
    : undefined;

  if (!isNumberArray(liked) || liked.length === 0) {
    return NextResponse.json(
      { error: "likedAnimeIds must be a non-empty array of MAL IDs" },
      { status: 400 }
    );
  }

  const likedScores =
    isNumberArray(scores) && scores.length === liked.length
      ? scores
      : liked.map(() => 9);
  const excludeMalIds = isNumberArray(exclude) ? exclude : [];

  try {
    // 1) Get a wide pool of candidates from pgvector.
    //    Try CF first (better quality). If none of the user's seeds are in the
    //    CF index (uncommon for popular picks), fall back to synopsis.
    let engineUsed: "cf" | "synopsis" = "cf";
    let allMatches;
    try {
      allMatches = await matchAnimeForUser({
        likedMalIds: liked,
        likedScores,
        excludeMalIds,
        matchCount: CANDIDATE_POOL,
        useCF: true,
      });
    } catch (cfErr) {
      // Any CF-side failure (seeds missing from CF index, no usable embeddings,
      // empty user vector, etc.) → fall back to synopsis embeddings, which
      // cover ~14k anime vs ~7.7k for CF.
      console.log("[v2] CF retrieval failed, falling back to synopsis:", String(cfErr));
      engineUsed = "synopsis";
      allMatches = await matchAnimeForUser({
        likedMalIds: liked,
        likedScores,
        excludeMalIds,
        matchCount: CANDIDATE_POOL,
        useCF: false,
      });
    }

    if (allMatches.length === 0) {
      return NextResponse.json({ results: [], engineUsed });
    }

    // 2) Filter out candidates that match user's structured dislikes
    const filtered = quiz?.dislikes
      ? applyDislikeFilters(allMatches, quiz.dislikes)
      : allMatches;

    const candidatePool = filtered.slice(0, TO_RERANK);

    // 3) LLM re-rank if Groq is configured
    let finalResults: AnimeMatch[] = candidatePool.slice(0, FINAL_COUNT);
    let reasons = new Map<number, string>();
    let llmUsed = false;
    let thinking = "";

    if (process.env.GROQ_API_KEY && candidatePool.length > 0) {
      try {
        // Pull seed titles for the prompt
        const seedRows = await getAnimeBasicsByMalIds(liked);
        const seedById = new Map(seedRows.map((s) => [s.mal_id, s]));

        const seedsForPrompt = liked
          .map((id, i) => ({ id, score: likedScores[i] }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .flatMap(({ id, score }) => {
            const s = seedById.get(id);
            if (!s) return [];
            return [{
              title: s.title_english ?? s.title,
              user_score: score,
              is_favorite: id === favoriteMalId,
            }];
          });

        // Pull tags + full synopsis for the candidate pool (richer than the RPC returns)
        const candidateIds = candidatePool.map((c) => c.id);
        const richData = await getAnimeRichDataByIds(candidateIds);

        const candidates: CandidateSummary[] = candidatePool.map((m) => {
          const rich = richData.get(m.id);
          const topTags = (rich?.tags ?? [])
            .filter((t) => t.rank >= 60)
            .sort((a, b) => b.rank - a.rank)
            .map((t) => t.name);
          return {
            id: m.id,
            title: m.title_english ?? m.title,
            year: m.year,
            genres: m.genres ?? [],
            top_tags: topTags,
            synopsis_excerpt: (rich?.synopsis ?? m.synopsis ?? "").slice(0, 600),
            similarity: m.similarity,
            avg_score: m.avg_score,
          };
        });

        const rerankResp = await rerankWithReasons({
          seeds: seedsForPrompt,
          userText,
          quiz,
          candidates,
          pickCount: FINAL_COUNT,
        });

        if (rerankResp.results.length > 0) {
          const matchById = new Map(candidatePool.map((m) => [m.id, m]));
          const ordered = rerankResp.results
            .map((r) => matchById.get(r.id))
            .filter((m): m is NonNullable<typeof m> => m != null);

          if (ordered.length > 0) {
            finalResults = ordered.slice(0, FINAL_COUNT);
            reasons = new Map(rerankResp.results.map((r) => [r.id, r.reason]));
            thinking = rerankResp.thinking;
            llmUsed = true;
          }
        }
      } catch (err) {
        console.warn("[v2] Groq re-rank failed, using embedding order:", err);
      }
    }

    const results = finalResults.map((m) => ({
      id: m.id,
      malId: m.mal_id,
      title: m.title_english ?? m.title,
      imageUrl: m.cover_url,
      score: m.avg_score,
      year: m.year,
      synopsis: m.synopsis,
      genres: m.genres ?? [],
      reason:
        reasons.get(m.id) ??
        `Semantic match (${(m.similarity * 100).toFixed(0)}% similar). ` +
          `Genres: ${(m.genres ?? []).slice(0, 3).join(", ") || "—"}.`,
    }));

    return NextResponse.json({ results, llmUsed, thinking, engineUsed });
  } catch (err) {
    console.error("[/api/recommend/v2] error:", err);
    return NextResponse.json(
      { error: "Failed to compute recommendations", detail: String(err) },
      { status: 500 }
    );
  }
}
