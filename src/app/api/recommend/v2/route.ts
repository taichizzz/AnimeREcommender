import { NextResponse } from "next/server";
import { matchAnimeForUser } from "@/lib/supabase";

// POST body:
//   { likedAnimeIds: number[],          // MAL IDs of seeds
//     likedScores?: number[],           // optional, 1-10 each; defaults to all 9s
//     excludeMalIds?: number[] }        // already-watched MAL IDs to skip

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const liked = body?.likedAnimeIds;
  const scores = body?.likedScores;
  const exclude = body?.excludeMalIds;

  if (!isNumberArray(liked) || liked.length === 0) {
    return NextResponse.json(
      { error: "likedAnimeIds must be a non-empty array of MAL IDs" },
      { status: 400 }
    );
  }

  // If caller didn't provide ratings (manual mode), assume strong-positive (9)
  const likedScores =
    isNumberArray(scores) && scores.length === liked.length
      ? scores
      : liked.map(() => 9);

  const excludeMalIds = isNumberArray(exclude) ? exclude : [];

  try {
    const matches = await matchAnimeForUser({
      likedMalIds: liked,
      likedScores,
      excludeMalIds,
      matchCount: 10,
    });

    const results = matches.map((m) => ({
      id: m.id,
      malId: m.mal_id,
      title: m.title_english ?? m.title,
      imageUrl: m.cover_url,
      score: m.avg_score,
      year: m.year,
      reason:
        `Semantic match (${(m.similarity * 100).toFixed(0)}% similar). ` +
        `Genres: ${(m.genres ?? []).slice(0, 3).join(", ") || "—"}.`,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[/api/recommend/v2] error:", err);
    return NextResponse.json(
      { error: "Failed to compute recommendations", detail: String(err) },
      { status: 500 }
    );
  }
}
