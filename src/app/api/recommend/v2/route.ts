import { NextResponse } from "next/server";
import { matchAnimeForUser, getAnimeBasicsByMalIds } from "@/lib/supabase";
import { rerankWithReasons } from "@/lib/groq";

// POST body:
//   { likedAnimeIds: number[],          // MAL IDs of seeds
//     likedScores?: number[],           // optional, 1-10 each; defaults to all 9s
//     excludeMalIds?: number[],         // already-watched MAL IDs to skip
//     userText?: string }               // optional natural-language preferences

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

const FINAL_COUNT = 10;
const CANDIDATE_POOL = 30;  // fetch this many, let Groq re-rank to FINAL_COUNT

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const liked = body?.likedAnimeIds;
  const scores = body?.likedScores;
  const exclude = body?.excludeMalIds;
  const userText: string | undefined =
    typeof body?.userText === "string" && body.userText.trim().length > 0
      ? body.userText.trim().slice(0, 500)  // cap length to keep prompt small
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
    // 1) Get top N candidates from pgvector (fast)
    const matches = await matchAnimeForUser({
      likedMalIds: liked,
      likedScores,
      excludeMalIds,
      matchCount: CANDIDATE_POOL,
    });

    if (matches.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // 2) Try LLM re-rank if Groq is configured. Falls back to embedding order if it fails.
    let finalResults = matches.slice(0, FINAL_COUNT);
    let reasons = new Map<number, string>();
    let llmUsed = false;

    if (process.env.GROQ_API_KEY) {
      try {
        // Pull seed titles for the prompt (we only have IDs from the request)
        // Use top 5 highest-rated seeds to keep prompt small
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
            }];
          });

        const candidates = matches.map((m) => ({
          id: m.id,
          title: m.title_english ?? m.title,
          year: m.year,
          genres: m.genres ?? [],
          synopsis_excerpt: (m.synopsis ?? "").slice(0, 300),
          similarity: m.similarity,
        }));

        const reranked = await rerankWithReasons({
          seeds: seedsForPrompt,
          userText,
          candidates,
          pickCount: FINAL_COUNT,
        });

        if (reranked.length > 0) {
          // Reorder matches according to LLM's pick order
          const matchById = new Map(matches.map((m) => [m.id, m]));
          const ordered = reranked
            .map((r) => matchById.get(r.id))
            .filter((m): m is NonNullable<typeof m> => m != null);

          if (ordered.length > 0) {
            finalResults = ordered.slice(0, FINAL_COUNT);
            reasons = new Map(reranked.map((r) => [r.id, r.reason]));
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
      reason:
        reasons.get(m.id) ??
        // Fallback if Groq didn't run or didn't write a reason for this id
        `Semantic match (${(m.similarity * 100).toFixed(0)}% similar). ` +
          `Genres: ${(m.genres ?? []).slice(0, 3).join(", ") || "—"}.`,
    }));

    return NextResponse.json({ results, llmUsed });
  } catch (err) {
    console.error("[/api/recommend/v2] error:", err);
    return NextResponse.json(
      { error: "Failed to compute recommendations", detail: String(err) },
      { status: 500 }
    );
  }
}
