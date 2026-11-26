export type AnimeSeason = "winter" | "spring" | "summer" | "fall";

export const SEASONS: AnimeSeason[] = ["winter", "spring", "summer", "fall"];

export type SeasonalAnime = {
  id: number;
  title: string;
  romajiTitle: string;
  imageUrl: string | null;
  score: number | null;
  members: number;
  mediaType: string | null;
  status: string | null;
  episodes: number | null;
  episodeDurationMin: number | null;
  synopsis: string | null;
  genres: string[];
  studios: string[];
  source: string | null;
  startDate: string | null;
  startSeason: { year: number; season: string } | null;
  broadcast: { day: string; time: string | null } | null;
  myListStatus: string | null;
  isNewThisSeason: boolean;
};

const MAL_API_BASE = "https://api.myanimelist.net/v2";
const SEASONAL_FIELDS = [
  "alternative_titles",
  "synopsis",
  "mean",
  "num_list_users",
  "media_type",
  "status",
  "genres",
  "num_episodes",
  "start_season",
  "broadcast",
  "source",
  "average_episode_duration",
  "studios",
  "start_date",
].join(",");

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 16;
const publicSeasonCache = new Map<string, { expiresAt: number; items: SeasonalAnime[] }>();

const SOURCE_LABELS: Record<string, string> = {
  original: "Original",
  manga: "Manga",
  "4_koma_manga": "4-Koma Manga",
  web_manga: "Web Manga",
  digital_manga: "Digital Manga",
  novel: "Novel",
  light_novel: "Light Novel",
  web_novel: "Web Novel",
  visual_novel: "Visual Novel",
  game: "Game",
  card_game: "Card Game",
  book: "Book",
  picture_book: "Picture Book",
  radio: "Radio",
  music: "Music",
  mixed_media: "Mixed Media",
  other: "Other",
};

/** Returns the anime season for a given date (Jan–Mar winter, Apr–Jun spring, Jul–Sep summer, Oct–Dec fall). */
export function getCurrentSeason(date = new Date()): { year: number; season: AnimeSeason } {
  const month = date.getMonth();
  const season: AnimeSeason =
    month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "fall";
  return { year: date.getFullYear(), season };
}

/** Type guard for the four valid MAL season slugs. */
export function isValidSeason(s: string | null | undefined): s is AnimeSeason {
  return s === "winter" || s === "spring" || s === "summer" || s === "fall";
}

/** Formats a year + season slug for headings (e.g. "Fall 2026"). */
export function formatSeasonLabel(year: number, season: AnimeSeason): string {
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

function formatSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (SOURCE_LABELS[raw]) return SOURCE_LABELS[raw];
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type MalSeasonNode = {
  id: number;
  title: string;
  main_picture?: { medium?: string; large?: string };
  alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
  synopsis?: string;
  mean?: number;
  num_list_users?: number;
  media_type?: string;
  status?: string;
  genres?: { id: number; name: string }[];
  num_episodes?: number;
  start_season?: { year: number; season: string };
  broadcast?: { day_of_the_week?: string; start_time?: string };
  source?: string;
  average_episode_duration?: number;
  studios?: { id: number; name: string }[];
  start_date?: string;
  my_list_status?: { status?: string };
};

type MalSeasonPage = {
  data?: { node: MalSeasonNode }[];
  paging?: { next?: string };
};

function normalizeNode(node: MalSeasonNode, year: number, season: AnimeSeason): SeasonalAnime {
  const englishTitle = node.alternative_titles?.en?.trim();
  const broadcastDay = node.broadcast?.day_of_the_week?.trim();

  return {
    id: node.id,
    title: englishTitle || node.title,
    romajiTitle: node.title,
    imageUrl: node.main_picture?.large ?? node.main_picture?.medium ?? null,
    score: typeof node.mean === "number" ? node.mean : null,
    members: typeof node.num_list_users === "number" ? node.num_list_users : 0,
    mediaType: node.media_type ?? null,
    status: node.status ?? null,
    episodes: typeof node.num_episodes === "number" && node.num_episodes > 0 ? node.num_episodes : null,
    episodeDurationMin:
      typeof node.average_episode_duration === "number" && node.average_episode_duration > 0
        ? Math.round(node.average_episode_duration / 60)
        : null,
    synopsis: node.synopsis?.trim() || null,
    genres: (node.genres ?? []).map((g) => g.name),
    studios: (node.studios ?? []).map((s) => s.name),
    source: formatSource(node.source),
    startDate: node.start_date ?? null,
    startSeason: node.start_season ?? null,
    broadcast: broadcastDay
      ? { day: broadcastDay, time: node.broadcast?.start_time?.trim() || null }
      : null,
    myListStatus: null,
    isNewThisSeason:
      node.start_season?.year === year && node.start_season?.season === season,
  };
}

async function fetchMalPages(
  initialUrl: string,
  headers: Record<string, string>,
  timeoutMs: number,
  maxPages = 2
): Promise<MalSeasonNode[]> {
  const nodes: MalSeasonNode[] = [];
  let url: string | null = initialUrl;

  for (let page = 0; page < maxPages && url; page++) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`MAL API ${res.status}: ${detail.slice(0, 200)}`);
    }

    const json = (await res.json()) as MalSeasonPage;
    for (const entry of json.data ?? []) {
      if (entry?.node?.id != null) nodes.push(entry.node);
    }
    url = json.paging?.next ?? null;
  }

  return nodes;
}

async function fetchPublicSeason(year: number, season: AnimeSeason): Promise<SeasonalAnime[]> {
  const cacheKey = `${year}-${season}`;
  const cached = publicSeasonCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.items;
  }

  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) {
    throw new Error("MAL_CLIENT_ID is not configured");
  }

  const url =
    `${MAL_API_BASE}/anime/season/${year}/${season}` +
    `?sort=anime_num_list_users&limit=100&fields=${encodeURIComponent(SEASONAL_FIELDS)}`;

  const rawNodes = await fetchMalPages(url, { "X-MAL-CLIENT-ID": clientId }, 8000, 2);

  const deduped = new Map<number, SeasonalAnime>();
  for (const node of rawNodes) {
    if (!deduped.has(node.id)) {
      deduped.set(node.id, normalizeNode(node, year, season));
    }
  }

  const items = Array.from(deduped.values());

  if (publicSeasonCache.size >= CACHE_MAX_ENTRIES) {
    const oldestKey = publicSeasonCache.keys().next().value;
    if (oldestKey !== undefined) publicSeasonCache.delete(oldestKey);
  }
  publicSeasonCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, items });

  return items;
}

async function fetchUserSeasonOverlay(
  year: number,
  season: AnimeSeason,
  accessToken: string
): Promise<{ statusById: Map<number, string>; authenticated: boolean }> {
  const url =
    `${MAL_API_BASE}/anime/season/${year}/${season}` +
    `?sort=anime_num_list_users&limit=100&fields=my_list_status`;

  try {
    const nodes = await fetchMalPages(
      url,
      { Authorization: `Bearer ${accessToken}` },
      5000,
      2
    );
    const statusById = new Map<number, string>();
    for (const node of nodes) {
      const status = node.my_list_status?.status;
      if (status) statusById.set(node.id, status);
    }
    return { statusById, authenticated: true };
  } catch {
    return { statusById: new Map(), authenticated: false };
  }
}

/**
 * Fetches normalized seasonal anime from MAL API v2 and optionally overlays
 * the signed-in user's list statuses without failing on expired tokens.
 */
export async function fetchSeasonalAnime(opts: {
  year: number;
  season: AnimeSeason;
  accessToken?: string;
}): Promise<{ items: SeasonalAnime[]; authenticated: boolean }> {
  const { year, season, accessToken } = opts;

  const [publicItems, overlay] = await Promise.all([
    fetchPublicSeason(year, season),
    accessToken
      ? fetchUserSeasonOverlay(year, season, accessToken)
      : Promise.resolve({ statusById: new Map<number, string>(), authenticated: false }),
  ]);

  const items = publicItems.map((item) => ({
    ...item,
    myListStatus: overlay.statusById.get(item.id) ?? null,
  }));

  return { items, authenticated: overlay.authenticated };
}
