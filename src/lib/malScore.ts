import { supabase } from "@/lib/supabase";

/**
 * MAL community scores (the 0-10 "mean" people recognise from MyAnimeList),
 * with our own table as a lazily-filled cache.
 *
 * Why not just use AniList's averageScore: it's a different crowd on a 0-100
 * scale, so Anohana reads 80 there and 8.28 on MAL. Users compare against MAL.
 *
 * Flow: read whatever is already cached, fetch only the misses from MAL's API
 * (client-id auth, no user login needed), then write those back. Nothing here
 * is allowed to fail a recommendation — on any error we simply return what we
 * have and the caller falls back to the AniList figure.
 */

const MAL_API = "https://api.myanimelist.net/v2/anime";
const FETCH_TIMEOUT_MS = 2500;
const MAX_CONCURRENT = 6;

/** How long a cached score is trusted before we re-check MAL. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

async function fetchOne(malId: number, clientId: string): Promise<number | null> {
  try {
    const res = await fetch(`${MAL_API}/${malId}?fields=mean`, {
      headers: { "X-MAL-CLIENT-ID": clientId },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { mean?: number };
    return typeof json.mean === "number" ? json.mean : null;
  } catch {
    return null; // network hiccup, timeout, unrated title — all non-fatal
  }
}

/** Run tasks with a small concurrency cap so we don't hammer MAL's rate limit. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * Returns MAL scores keyed by MAL id. Ids with no known score are simply absent
 * from the map — callers should fall back rather than treat that as an error.
 */
export async function getMalScores(malIds: number[]): Promise<Map<number, number>> {
  const ids = Array.from(new Set(malIds.filter((n) => Number.isFinite(n))));
  const scores = new Map<number, number>();
  if (ids.length === 0) return scores;

  // 1) Read the cache. An entry counts as fresh purely on its timestamp — even
  //    when the score is null, because "MAL has no score for this yet" is itself
  //    worth remembering (unaired titles would otherwise be re-fetched forever).
  let stale = ids;
  try {
    const { data, error } = await supabase
      .from("anime")
      .select("mal_id, mal_score, mal_score_updated_at")
      .in("mal_id", ids);
    if (error) throw error;

    const cutoff = Date.now() - CACHE_TTL_MS;
    const fresh = new Set<number>();

    for (const row of data ?? []) {
      const r = row as {
        mal_id: number | null;
        mal_score: number | null;
        mal_score_updated_at: string | null;
      };
      if (r.mal_id == null || !r.mal_score_updated_at) continue;
      if (Date.parse(r.mal_score_updated_at) < cutoff) continue; // expired

      fresh.add(r.mal_id);
      if (r.mal_score != null) scores.set(r.mal_id, r.mal_score);
    }
    stale = ids.filter((id) => !fresh.has(id));
  } catch (err) {
    // Most likely a column doesn't exist yet — fall back to API-only.
    console.log("[malScore] cache read failed, using API only:", String(err).slice(0, 100));
  }

  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId || stale.length === 0) return scores;

  // 2) Re-check anything missing or older than the TTL.
  const fetched = await mapLimit(stale, MAX_CONCURRENT, async (id) => ({
    id,
    mean: await fetchOne(id, clientId),
  }));

  for (const f of fetched) {
    if (f.mean != null) scores.set(f.id, f.mean);
  }

  // 3) Stamp every attempt, including the ones that came back without a score,
  //    so a null result is cached for the TTL rather than retried each request.
  //    Best-effort: a failed write just means we re-check sooner.
  try {
    const now = new Date().toISOString();
    await Promise.all(
      fetched.map((f) =>
        supabase
          .from("anime")
          .update({ mal_score: f.mean, mal_score_updated_at: now })
          .eq("mal_id", f.id)
      )
    );
  } catch (err) {
    console.log("[malScore] cache write failed:", String(err).slice(0, 100));
  }

  return scores;
}
