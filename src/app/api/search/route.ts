import { NextResponse } from "next/server";
import { jikanGet } from "@/lib/jikan";
import { supabase } from "@/lib/supabase";

// Title search: Jikan first (broadest, always-current catalogue), our own
// Supabase index as the fallback.
//
// Jikan depends on MyAnimeList being reachable — when MAL refuses it, Jikan
// serves only what's already cached and 504s on everything else. The Supabase
// fallback keeps search working through those outages, and every row it returns
// is an anime the recommender can actually seed with.

type SearchResult = {
  id: number;                 // MAL id — what the recommender seeds on
  title: string;
  synopsis: string | null;
  imageUrl: string | null;
  score: number | null;       // 0-10 scale, matching MAL
  year: number | null;
};

const RETURN_LIMIT = 10;

// ── Primary: Jikan ───────────────────────────────────────────────────────────

type JikanAnime = {
  mal_id: number;
  title: string;
  synopsis: string | null;
  score: number | null;
  year: number | null;
  images: { jpg?: { image_url?: string } };
};

async function searchJikan(q: string): Promise<SearchResult[]> {
  const json = await jikanGet<{ data: JikanAnime[] }>(
    `/anime?q=${encodeURIComponent(q)}&limit=${RETURN_LIMIT}`
  );
  return (json.data ?? []).map((a) => ({
    id: a.mal_id,
    title: a.title,
    synopsis: a.synopsis,
    imageUrl: a.images?.jpg?.image_url ?? null,
    score: a.score,
    year: a.year,
  }));
}

// ── Fallback: our Supabase index ─────────────────────────────────────────────

type AnimeSearchRow = {
  mal_id: number | null;
  title: string;
  title_english: string | null;
  synopsis: string | null;
  cover_url: string | null;
  year: number | null;
  avg_score: number | null;
};

const FETCH_LIMIT = 40; // over-fetch, then rank for relevance

// Postgres treats % and _ as wildcards inside ilike — escape them so a literal
// "100%" search doesn't match everything.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Rank by how squarely the title matches, then by community score. Without
// this, "naruto" surfaces "ROAD OF NARUTO" above "Naruto".
function relevance(row: AnimeSearchRow, q: string): number {
  const titles = [row.title, row.title_english].filter(Boolean).map((t) => t!.toLowerCase());
  let best = 0;
  for (const t of titles) {
    if (t === q) best = Math.max(best, 100);
    else if (t.startsWith(q)) best = Math.max(best, 70);
    else if (t.includes(` ${q}`)) best = Math.max(best, 40); // word-start match
    else if (t.includes(q)) best = Math.max(best, 20);
  }
  // Shorter titles are usually the canonical entry ("Naruto" over "Naruto: Shippuden").
  const brevity = titles.length > 0 ? Math.max(0, 30 - Math.min(titles[0].length, 30)) / 30 : 0;
  return best + brevity * 5 + (row.avg_score ?? 0) / 100;
}

async function searchSupabase(q: string): Promise<SearchResult[]> {
  const pattern = `%${escapeLike(q)}%`;
  const { data, error } = await supabase
    .from("anime")
    .select("mal_id, title, title_english, synopsis, cover_url, year, avg_score")
    .or(`title.ilike.${pattern},title_english.ilike.${pattern}`)
    .not("mal_id", "is", null)
    .order("avg_score", { ascending: false, nullsFirst: false })
    .limit(FETCH_LIMIT);

  if (error) throw error;

  const lower = q.toLowerCase();
  return (data as AnimeSearchRow[])
    .sort((a, b) => relevance(b, lower) - relevance(a, lower))
    .slice(0, RETURN_LIMIT)
    .map((a) => ({
      id: a.mal_id as number,
      title: a.title_english ?? a.title,
      synopsis: a.synopsis,
      imageUrl: a.cover_url,
      // Stored 0-100; the UI shows the familiar 0-10 MAL scale.
      score: a.avg_score != null ? Math.round(a.avg_score) / 10 : null,
      year: a.year,
    }));
}

// ── Route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("q")?.trim();

  if (!raw) {
    return NextResponse.json(
      { error: "Missing query parameter. Use /api/search?q=naruto" },
      { status: 400 }
    );
  }

  const q = raw.slice(0, 100);

  // 1) Jikan — broadest catalogue when it's healthy.
  try {
    const results = await searchJikan(q);
    if (results.length > 0) {
      return NextResponse.json({ results, source: "jikan" });
    }
    // Zero hits can mean Jikan is serving a degraded cache; try our index too.
  } catch (err) {
    console.log("[/api/search] Jikan unavailable, falling back to index:", String(err).slice(0, 120));
  }

  // 2) Our own index — always reachable, always seedable.
  try {
    const results = await searchSupabase(q);
    return NextResponse.json({ results, source: "index" });
  } catch (err) {
    console.error("[/api/search] index search failed:", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
