import { NextResponse } from "next/server";
import { jikanGet } from "@/lib/jikan";

type JikanNamed = { mal_id: number; name: string };

type JikanAnimeDetails = {
  mal_id: number;
  title: string;
  year: number | null;
  score: number | null;
  images: { jpg?: { image_url?: string } };
  genres?: JikanNamed[];
  themes?: JikanNamed[];
  demographics?: JikanNamed[];
};

type JikanAnimeResponse = { data: JikanAnimeDetails };

type JikanAnimeListItem = {
  mal_id: number;
  title: string;
  year: number | null;
  score: number | null;
  images: { jpg?: { image_url?: string } };
  genres?: JikanNamed[];
};

type JikanAnimeListResponse = { data: JikanAnimeListItem[] };

// /anime/{id}/recommendations response
type JikanRecoItem = {
  entry: {
    mal_id: number;
    title: string;
    images: { jpg?: { image_url?: string } };
  };
  votes: number;
};

type JikanRecoResponse = { data: JikanRecoItem[] };

type RecommendationItem = {
  id: number;
  title: string;
  imageUrl: string | null;
  score: number | null;
  year: number | null;
  reason: string;
};

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

function normalizeTitle(t: string) {
  return t.toLowerCase().replace(/\s+/g, " ").trim();
}


// Later, we can make this a user toggle or use MAL "relations" for perfect filtering.
function shouldExcludeTitle(title: string) {
  const t = normalizeTitle(title);

  // Non-mainline formats
  const badWords = ["movie", "ova", "ona", "special", "recap", "summary", "pilot", "chibi"];
  if (badWords.some((w) => t.includes(w))) return true;

  // Sequel indicators
  if (/\bseason\s*\d+\b/.test(t)) return true;        // "season 2"
  if (/\bpart\s*\d+\b/.test(t)) return true;          // "part 2"
  if (/\b\d+(st|nd|rd|th)\s+season\b/.test(t)) return true; // "2nd season"
  if (/\b(ii|iii|iv|v)\b/.test(t)) return true;       // roman numerals

  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Simple in-memory cache (works well in dev)
const cache = new Map<string, { expiresAt: number; value: any }>();

async function cachedJikanGet<T>(path: string, ttlMs = 10 * 60 * 1000): Promise<T> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await jikanGet<T>(path);
  cache.set(path, { expiresAt: now + ttlMs, value });
  return value;
}

// Retry wrapper for rate limits
async function jikanGetWithBackoff<T>(path: string, maxRetries = 3): Promise<T> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await cachedJikanGet<T>(path);
    } catch (e) {
      lastErr = e;
      const msg = String(e);

      if (msg.includes("429")) {
        const wait = 1000 * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }

      await sleep(300 * (attempt + 1));
    }
  }

  throw lastErr;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const likedAnimeIdsUnknown: unknown = body?.likedAnimeIds;

  if (!isNumberArray(likedAnimeIdsUnknown) || likedAnimeIdsUnknown.length === 0) {
    return NextResponse.json(
      { error: "likedAnimeIds must be a non-empty array of numbers" },
      { status: 400 }
    );
  }

  // UI max is 3
  const likedAnimeIds = likedAnimeIdsUnknown.slice(0, 3);
  const likedSet = new Set(likedAnimeIds);

  try {
    // 1) Fetch liked anime details (sequential)
    const likedAnime: JikanAnimeDetails[] = [];
    for (const id of likedAnimeIds) {
      const r = await jikanGetWithBackoff<JikanAnimeResponse>(`/anime/${id}`);
      likedAnime.push(r.data);
      await sleep(350);
    }

    // 2) Build preference signals
    const nameSet = new Set<string>();
    const genreCount = new Map<number, number>();

    for (const a of likedAnime) {
      for (const g of a.genres ?? []) {
        nameSet.add(g.name);
        genreCount.set(g.mal_id, (genreCount.get(g.mal_id) ?? 0) + 1);
      }
      for (const t of a.themes ?? []) nameSet.add(t.name);
      for (const d of a.demographics ?? []) nameSet.add(d.name);
    }

    const becauseTitles = likedAnime.map((x) => x.title).join(", ");

    // 3) Candidate generation v2: related recs + genre list
    // candidateMap holds merged candidates with a bonus weight and a short "why" text
    const candidateMap = new Map<
      number,
      { item: JikanAnimeListItem; bonus: number; why: string }
    >();

    // A) Related recommendations (strong signal)
    for (const a of likedAnime) {
      const reco = await jikanGetWithBackoff<JikanRecoResponse>(
        `/anime/${a.mal_id}/recommendations`
      );

      for (const r of reco.data.slice(0, 20)) {
        const id = r.entry.mal_id;
        if (likedSet.has(id)) continue;

        const minimal: JikanAnimeListItem = {
          mal_id: id,
          title: r.entry.title,
          year: null,
          score: null,
          images: r.entry.images,
          genres: undefined,
        };

        const bonus = Math.min(12, 2 + Math.floor(r.votes / 30)); // votes -> bonus
        const prev = candidateMap.get(id);

        if (!prev) {
          candidateMap.set(id, {
            item: minimal,
            bonus,
            why: `Recommended by fans of: ${a.title}`,
          });
        } else {
          candidateMap.set(id, {
            item: prev.item,
            bonus: prev.bonus + bonus,
            why: `${prev.why}, ${a.title}`,
          });
        }
      }

      await sleep(500);
    }

    // B) Genre-based candidates (breadth)
    const topGenres = Array.from(genreCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);

    for (const genreId of topGenres) {
      const page = await jikanGetWithBackoff<JikanAnimeListResponse>(
        `/anime?genres=${genreId}&limit=15&order_by=score&sort=desc`
      );

      for (const c of page.data) {
        if (likedSet.has(c.mal_id)) continue;

        const prev = candidateMap.get(c.mal_id);
        if (!prev) {
          candidateMap.set(c.mal_id, {
            item: c,
            bonus: 0,
            why: "Similar genres to your picks",
          });
        } else {
          // If we already had it from related recs, keep the bonus+why,
          // but replace minimal fields with richer list data.
          candidateMap.set(c.mal_id, {
            item: {
              ...c,
              images: prev.item.images?.jpg?.image_url ? prev.item.images : c.images,
            },
            bonus: prev.bonus,
            why: prev.why,
          });
        }
      }

      await sleep(500);
    }

    // 4) Enrich top missing candidates (optional, small)
    // Some related-reco candidates have score/year missing.
    // We fetch details for a few top-bonus candidates to improve ranking.
    const enrichTargets = Array.from(candidateMap.values())
      .filter((x) => x.item.score == null || x.item.year == null || x.item.genres == null)
      .sort((a, b) => b.bonus - a.bonus)
      .slice(0, 5);

    for (const t of enrichTargets) {
      const id = t.item.mal_id;
      try {
        const det = await jikanGetWithBackoff<JikanAnimeResponse>(`/anime/${id}`);
        const d = det.data;
        candidateMap.set(id, {
          item: {
            mal_id: d.mal_id,
            title: d.title,
            year: d.year,
            score: d.score,
            images: d.images,
            genres: d.genres,
          },
          bonus: t.bonus,
          why: t.why,
        });
        await sleep(350);
      } catch {
        // If enrichment fails (rate-limit etc.), just keep minimal info.
      }
    }

    const candidates = Array.from(candidateMap.values()).filter((wrap) => !shouldExcludeTitle(wrap.item.title));

    // 5) Score + rank
    const scored = candidates
      .map((wrap) => {
        const c = wrap.item;

        const overlap = (c.genres ?? []).map((g) => g.name).filter((name) => nameSet.has(name));
        const overlapScore = overlap.length * 2;
        const malScore = (c.score ?? 0) / 2;

        // Total score: related-bonus is strong, then overlap, then MAL score
        const total = wrap.bonus + overlapScore + malScore;

        const overlapText = overlap.length > 0 ? overlap.slice(0, 3).join(", ") : "your picks";

        return {
          c,
          total,
          reason: `${wrap.why}. Because you liked ${becauseTitles}. Similar in: ${overlapText}.`,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(
        (s): RecommendationItem => ({
          id: s.c.mal_id,
          title: s.c.title,
          imageUrl: s.c.images?.jpg?.image_url ?? null,
          score: s.c.score,
          year: s.c.year,
          reason: s.reason,
        })
      );

    return NextResponse.json({ results: scored });
  } catch (err) {
    const msg = String(err);
    const is429 = msg.includes("429");
    return NextResponse.json(
      {
        error: is429
          ? "Rate limited by Jikan. Please wait a few seconds and try again."
          : "Failed to compute recommendations",
        detail: msg,
      },
      { status: 500 }
    );
  }
}
