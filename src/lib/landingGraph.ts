import { supabase } from "@/lib/supabase";

export type LandingGraphNode = {
  malId: number;
  title: string;
  shortTitle: string;
  year: number | null;
  imageSources: string[];
  genres: string[];
  connectionNote: string;
};

type SeedSpec = {
  malId: number;
  fallbackTitle: string;
  shortTitle: string;
  fallbackYear: number;
  fallbackGenres: string[];
  connectionNote: string;
};

const SEED_SPECS: SeedSpec[] = [
  {
    malId: 52991,
    fallbackTitle: "Frieren: Beyond Journey's End",
    shortTitle: "Frieren",
    fallbackYear: 2023,
    fallbackGenres: ["Adventure", "Drama", "Fantasy"],
    connectionNote:
      "After the demon king falls, an immortal elf retraces her old party's journey to understand the friends she outlived, a quiet hook viewers carry straight into the shows around it.",
  },
  {
    malId: 54492,
    fallbackTitle: "The Apothecary Diaries",
    shortTitle: "Apothecary Diaries",
    fallbackYear: 2023,
    fallbackGenres: ["Drama", "Mystery"],
    connectionNote:
      "Maomao just wants to test poisons in peace, yet her sharp eye drags her into palace mysteries that hit the same unhurried warmth viewers love in this group.",
  },
  {
    malId: 457,
    fallbackTitle: "Mushishi",
    shortTitle: "Mushishi",
    fallbackYear: 2005,
    fallbackGenres: ["Adventure", "Mystery", "Supernatural"],
    connectionNote:
      "Ginko wanders rural Japan helping villagers survive odd spirit creatures called mushi, solving each haunting like a calm folk diagnosis for viewers who prefer atmosphere over big fights.",
  },
  {
    malId: 33352,
    fallbackTitle: "Violet Evergarden",
    shortTitle: "Violet Evergarden",
    fallbackYear: 2018,
    fallbackGenres: ["Drama", "Fantasy"],
    connectionNote:
      "A former child soldier with mechanical hands learns to write letters for strangers while unpacking her major's final words, earning the same slow emotional payoff.",
  },
  {
    malId: 52701,
    fallbackTitle: "Delicious in Dungeon",
    shortTitle: "Delicious in Dungeon",
    fallbackYear: 2024,
    fallbackGenres: ["Adventure", "Comedy", "Fantasy"],
    connectionNote:
      "Laios drags his broke party back into a dungeon to rescue his sister by cooking every monster they slay, sneaking real fantasy heart beneath the comedy.",
  },
  {
    malId: 2966,
    fallbackTitle: "Spice and Wolf",
    shortTitle: "Spice and Wolf",
    fallbackYear: 2008,
    fallbackGenres: ["Adventure", "Drama", "Romance"],
    connectionNote:
      "A traveling merchant strikes a deal with a witty wolf harvest goddess to escort her north, rewarding viewers who show up for clever banter and long road journeys.",
  },
];

const CACHE_TTL_MS = 15 * 60 * 1000;
let cachedNodes: { expiresAt: number; nodes: LandingGraphNode[] } | null = null;

type SupabaseSeedRow = {
  mal_id: number | null;
  title: string;
  title_english: string | null;
  cover_url: string | null;
  year: number | null;
  genres: string[] | null;
};

type AniListMedia = {
  idMal: number | null;
  title: { english: string | null; romaji: string | null } | null;
  bannerImage: string | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  trailer: { id: string | null; site: string | null } | null;
  startDate: { year: number | null } | null;
  genres: string[] | null;
};

const ANILIST_BATCH_QUERY = `
  query ($malIds: [Int]) {
    Page(page: 1, perPage: 10) {
      media(idMal_in: $malIds, type: ANIME) {
        idMal
        title { english romaji }
        bannerImage
        coverImage { extraLarge large }
        trailer { id site }
        startDate { year }
        genres
      }
    }
  }
`;

function dedupeSources(candidates: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of candidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

/**
 * Loads landscape-first artwork and metadata for the landing-page knowledge graph.
 * Fetches Supabase metadata and AniList widescreen banners / XL covers in parallel.
 */
export async function getLandingGraphNodes(): Promise<LandingGraphNode[]> {
  if (cachedNodes && Date.now() < cachedNodes.expiresAt) {
    return cachedNodes.nodes;
  }

  const malIds = SEED_SPECS.map((s) => s.malId);
  const supaByMal = new Map<number, SupabaseSeedRow>();
  const aniByMal = new Map<number, AniListMedia>();

  const [supaResult, aniResult] = await Promise.allSettled([
    supabase
      .from("anime")
      .select("mal_id, title, title_english, cover_url, year, genres")
      .in("mal_id", malIds),
    fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        query: ANILIST_BATCH_QUERY,
        variables: { malIds },
      }),
      signal: AbortSignal.timeout(4500),
    }).then(async (res) => {
      if (!res.ok) return null;
      return (await res.json()) as {
        data?: { Page?: { media?: AniListMedia[] } };
      };
    }),
  ]);

  if (supaResult.status === "fulfilled" && !supaResult.value.error && supaResult.value.data) {
    for (const row of supaResult.value.data as SupabaseSeedRow[]) {
      if (row.mal_id != null) supaByMal.set(row.mal_id, row);
    }
  }

  if (aniResult.status === "fulfilled" && aniResult.value?.data?.Page?.media) {
    for (const media of aniResult.value.data.Page.media) {
      if (media.idMal != null) aniByMal.set(media.idMal, media);
    }
  }

  const nodes: LandingGraphNode[] = SEED_SPECS.map((spec) => {
    const supa = supaByMal.get(spec.malId);
    const ani = aniByMal.get(spec.malId);

    // High-res key art first (smart-cropped cleanly to 4:3), then Supabase/banner fallback.
    const imageSources = dedupeSources([
      ani?.coverImage?.extraLarge,
      ani?.coverImage?.large,
      supa?.cover_url,
      ani?.bannerImage,
    ]);

    const genres =
      supa?.genres && supa.genres.length > 0
        ? supa.genres
        : ani?.genres && ani.genres.length > 0
          ? ani.genres
          : spec.fallbackGenres;

    return {
      malId: spec.malId,
      title:
        supa?.title_english ||
        supa?.title ||
        ani?.title?.english ||
        ani?.title?.romaji ||
        spec.fallbackTitle,
      shortTitle: spec.shortTitle,
      year: supa?.year ?? ani?.startDate?.year ?? spec.fallbackYear,
      imageSources,
      genres,
      connectionNote: spec.connectionNote,
    };
  });

  const populatedCount = nodes.filter((n) => n.imageSources.length > 0).length;
  if (populatedCount >= 4) {
    cachedNodes = { expiresAt: Date.now() + CACHE_TTL_MS, nodes };
  }

  return nodes;
}
