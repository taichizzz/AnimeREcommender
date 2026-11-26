import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  rerankWithReasons,
  type CandidateSummary,
  type SeedSummary,
} from "@/lib/groq";
import {
  fetchSeasonalAnime,
  formatSeasonLabel,
  getCurrentSeason,
  isValidSeason,
  type AnimeSeason,
  type SeasonalAnime,
} from "@/lib/malSeasonal";

const ALLOWED_MEDIA_TYPES = new Set(["tv", "ona", "movie"]);
const EXCLUDED_LIST_STATUSES = new Set(["completed", "watching", "dropped"]);
const PICK_COUNT = 8;
const CANDIDATE_LIMIT = 30;

const DISLIKE_GENRE_MAP: Record<string, string[]> = {
  "Romance focus": ["Romance"],
  Sports: ["Sports"],
  "Slice-of-life": ["Slice of Life"],
  "Ecchi/fanservice": ["Ecchi"],
  Mecha: ["Mecha"],
};

type CompletedMalEntry = {
  node: {
    id: number;
    title: string;
    genres?: { id: number; name: string }[];
    studios?: { id: number; name: string }[];
    source?: string;
  };
  list_status: { score: number };
};

type UserTasteProfile = {
  malUsed: boolean;
  seeds: SeedSummary[];
  genreAffinity: Map<string, number>;
  studioAffinity: Map<string, number>;
  favoriteStudios: string[];
};

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === "string");
}

async function fetchUserTasteProfile(accessToken: string): Promise<UserTasteProfile> {
  const empty: UserTasteProfile = {
    malUsed: false,
    seeds: [],
    genreAffinity: new Map(),
    studioAffinity: new Map(),
    favoriteStudios: [],
  };

  const fields = "list_status{score},genres,studios,source";
  let url: string | null =
    `https://api.myanimelist.net/v2/users/@me/animelist?status=completed&sort=list_score&limit=100&fields=${fields}`;

  const entries: CompletedMalEntry[] = [];
  try {
    for (let page = 0; page < 5 && url; page++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(6000),
        cache: "no-store",
      });
      if (!res.ok) return empty;
      const json = (await res.json()) as {
        data?: CompletedMalEntry[];
        paging?: { next?: string };
      };
      entries.push(...(json.data ?? []));
      url = json.paging?.next ?? null;
    }
  } catch {
    return empty;
  }

  const rated = entries.filter((e) => e.list_status.score > 0);
  if (rated.length === 0) return empty;

  const genreAffinity = new Map<string, number>();
  const studioAffinity = new Map<string, number>();

  for (const entry of rated) {
    const score = entry.list_status.score;
    const delta = score >= 7 ? (score - 6) * 0.5 : score <= 5 ? -(6 - score) * 0.6 : 0;
    if (delta === 0) continue;

    for (const g of entry.node.genres ?? []) {
      genreAffinity.set(g.name, (genreAffinity.get(g.name) ?? 0) + delta);
    }
    for (const s of entry.node.studios ?? []) {
      studioAffinity.set(s.name, (studioAffinity.get(s.name) ?? 0) + delta);
    }
  }

  const seeds: SeedSummary[] = [...rated]
    .sort((a, b) => b.list_status.score - a.list_status.score)
    .slice(0, 8)
    .map((e) => ({ title: e.node.title, user_score: e.list_status.score }));

  const favoriteStudios = Array.from(studioAffinity.entries())
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);

  return {
    malUsed: true,
    seeds,
    genreAffinity,
    studioAffinity,
    favoriteStudios,
  };
}

function preRankSeasonal(
  items: SeasonalAnime[],
  taste: UserTasteProfile
): { item: SeasonalAnime; preScore: number }[] {
  const maxLogMembers = Math.max(
    1,
    ...items.map((item) => Math.log10(Math.max(10, item.members)))
  );

  const scored = items.map((item) => {
    const popNorm = Math.log10(Math.max(10, item.members)) / maxLogMembers;
    const scoreNorm = item.score != null ? Math.max(0, (item.score - 5) / 5) : 0.35;

    let tasteScore = 0;
    if (taste.malUsed) {
      const genreSum = item.genres.reduce(
        (acc, g) => acc + (taste.genreAffinity.get(g) ?? 0),
        0
      );
      const studioSum = item.studios.reduce(
        (acc, s) => acc + (taste.studioAffinity.get(s) ?? 0),
        0
      );
      tasteScore = Math.tanh(genreSum / 12) * 0.45 + Math.tanh(studioSum / 4) * 0.25;
    }

    const raw = popNorm * 0.45 + scoreNorm * 0.35 + tasteScore;
    return { item, preScore: Math.max(0.05, Math.min(0.99, raw)) };
  });

  return scored.sort((a, b) => b.preScore - a.preScore);
}

function buildFallbackReason(item: SeasonalAnime, seasonLabel: string): string {
  const studioPart = item.studios.length > 0 ? ` by ${item.studios.slice(0, 2).join(" & ")}` : "";
  const genrePart = item.genres.length > 0 ? item.genres.slice(0, 3).join(", ") : "seasonal pick";
  const scorePart = item.score != null ? ` (${item.score.toFixed(2)} on MAL)` : "";
  return `Top ${seasonLabel} match${studioPart}${scorePart} — ${genrePart}.`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const current = getCurrentSeason();

  const year: number =
    typeof body?.year === "number" && Number.isInteger(body.year) ? body.year : current.year;
  const rawSeason: unknown = body?.season;
  const season: AnimeSeason =
    typeof rawSeason === "string" && isValidSeason(rawSeason.toLowerCase())
      ? (rawSeason.toLowerCase() as AnimeSeason)
      : current.season;

  if (year < 1970 || year > current.year + 2) {
    return NextResponse.json(
      { error: `year must be an integer between 1970 and ${current.year + 2}` },
      { status: 400 }
    );
  }

  const mood = isStringArray(body?.mood) ? body.mood.slice(0, 12) : [];
  const dislikes = isStringArray(body?.dislikes) ? body.dislikes.slice(0, 12) : [];
  const newOnly = typeof body?.newOnly === "boolean" ? body.newOnly : true;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("mal_access_token")?.value;

  try {
    const [{ items }, taste] = await Promise.all([
      fetchSeasonalAnime({ year, season, accessToken }),
      accessToken
        ? fetchUserTasteProfile(accessToken)
        : Promise.resolve<UserTasteProfile>({
            malUsed: false,
            seeds: [],
            genreAffinity: new Map(),
            studioAffinity: new Map(),
            favoriteStudios: [],
          }),
    ]);

    const formatFiltered = items.filter((item) =>
      item.mediaType ? ALLOWED_MEDIA_TYPES.has(item.mediaType.toLowerCase()) : true
    );

    const seasonScoped = newOnly
      ? formatFiltered.filter((item) => item.isNewThisSeason)
      : formatFiltered;
    const basePool =
      newOnly && seasonScoped.length >= 12 ? seasonScoped : formatFiltered;

    const unwatchedPool = basePool.filter(
      (item) => !item.myListStatus || !EXCLUDED_LIST_STATUSES.has(item.myListStatus)
    );

    const forbiddenGenres = new Set<string>();
    for (const d of dislikes) {
      for (const genre of DISLIKE_GENRE_MAP[d] ?? []) {
        forbiddenGenres.add(genre.toLowerCase());
      }
    }

    const filtered =
      forbiddenGenres.size > 0
        ? unwatchedPool.filter(
            (item) => !item.genres.some((g) => forbiddenGenres.has(g.toLowerCase()))
          )
        : unwatchedPool;

    if (filtered.length === 0) {
      return NextResponse.json({
        year,
        season,
        results: [],
        thinking: "",
        llmUsed: false,
        malUsed: taste.malUsed,
      });
    }

    const ranked = preRankSeasonal(filtered, taste).slice(0, CANDIDATE_LIMIT);
    const pickCount = Math.min(PICK_COUNT, ranked.length);
    const seasonLabel = formatSeasonLabel(year, season);

    let finalItems = ranked.slice(0, pickCount).map((r) => r.item);
    let reasonById = new Map<number, string>();
    let thinking = "";
    let llmUsed = false;

    if (process.env.GROQ_API_KEY) {
      try {
        const candidates: CandidateSummary[] = ranked.map(({ item, preScore }) => {
          const tags: string[] = [];
          if (item.studios.length > 0) tags.push(`Studio: ${item.studios.join(", ")}`);
          if (item.source) tags.push(`Source: ${item.source}`);
          if (item.mediaType) tags.push(`Format: ${item.mediaType.toUpperCase()}`);
          if (item.broadcast) {
            tags.push(
              `Airs: ${item.broadcast.day}${item.broadcast.time ? ` ${item.broadcast.time} JST` : ""}`
            );
          }
          tags.push(item.isNewThisSeason ? "New this season" : "Continuing");

          return {
            id: item.id,
            title: item.title,
            year: item.startSeason?.year ?? year,
            genres: item.genres,
            top_tags: tags,
            synopsis_excerpt: (item.synopsis ?? "").slice(0, 600),
            similarity: preScore,
            avg_score: item.score != null ? Math.round(item.score * 10) : null,
          };
        });

        const noteParts = [`Curating anime airing in ${seasonLabel}.`];
        if (taste.favoriteStudios.length > 0) {
          noteParts.push(`User's favorite studios: ${taste.favoriteStudios.join(", ")}.`);
        }
        if (!taste.malUsed) {
          noteParts.push(
            mood.length > 0
              ? `No MAL watch history provided; prioritize the requested moods (${mood.join(", ")}) and strongest premises.`
              : `No MAL watch history provided; pick a diverse standout slate across the season.`
          );
        }

        const seeds: SeedSummary[] =
          taste.seeds.length > 0
            ? taste.seeds
            : [{ title: `${seasonLabel} seasonal explorer` }];

        const rerankResp = await rerankWithReasons({
          seeds,
          userText: noteParts.join(" "),
          quiz: {
            mood: mood.length > 0 ? mood : undefined,
            dislikes: dislikes.length > 0 ? dislikes : undefined,
          },
          candidates,
          pickCount,
        });

        const itemById = new Map(ranked.map((r) => [r.item.id, r.item]));
        const seen = new Set<number>();
        const dedupedPicks: { item: SeasonalAnime; reason: string }[] = [];

        for (const pick of rerankResp.results) {
          if (seen.has(pick.id)) continue;
          const item = itemById.get(pick.id);
          if (!item) continue;
          seen.add(pick.id);
          dedupedPicks.push({ item, reason: pick.reason });
        }

        if (dedupedPicks.length > 0) {
          finalItems = dedupedPicks.slice(0, pickCount).map((p) => p.item);
          reasonById = new Map(dedupedPicks.map((p) => [p.item.id, p.reason]));
          thinking = rerankResp.thinking;
          llmUsed = true;
        }
      } catch (err) {
        console.warn("[/api/recommend/seasonal] Groq rerank failed, using pre-rank order:", err);
      }
    }

    const results = finalItems.map((item) => ({
      ...item,
      reason: reasonById.get(item.id) ?? buildFallbackReason(item, seasonLabel),
    }));

    return NextResponse.json({
      year,
      season,
      results,
      thinking,
      llmUsed,
      malUsed: taste.malUsed,
    });
  } catch (err) {
    console.error("[/api/recommend/seasonal] error:", err);
    return NextResponse.json(
      { error: "Failed to curate seasonal anime" },
      { status: 500 }
    );
  }
}
