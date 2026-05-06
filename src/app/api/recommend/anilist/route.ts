import { NextResponse } from "next/server";
import { anilistQuery } from "@/lib/anilist";

// ── Types ────────────────────────────────────────────────────────────────────

type AniListTag = { name: string; rank: number; isMediaSpoiler: boolean };

type AniListMedia = {
  id: number;
  idMal: number | null;
  title: { romaji: string; english: string | null };
  averageScore: number | null; // 0-100
  startDate: { year: number | null };
  coverImage: { large: string | null };
  genres: string[];
  tags: AniListTag[];
};

type FeatureVector = Map<string, number>;

// ── Feature helpers ──────────────────────────────────────────────────────────

function vectorFromMedia(m: Pick<AniListMedia, "genres" | "tags">): FeatureVector {
  const v: FeatureVector = new Map();
  for (const g of m.genres) v.set(`genre:${g}`, (v.get(`genre:${g}`) ?? 0) + 1);
  for (const t of m.tags) {
    if (t.isMediaSpoiler) continue;
    // weight by rank (0-100) so a 95-rank tag contributes more than a 10-rank tag
    const weight = t.rank / 100;
    v.set(`tag:${t.name}`, (v.get(`tag:${t.name}`) ?? 0) + weight);
  }
  return v;
}

function sumVectors(vectors: FeatureVector[]): FeatureVector {
  const out: FeatureVector = new Map();
  for (const v of vectors) for (const [k, n] of v) out.set(k, (out.get(k) ?? 0) + n);
  return out;
}

function cosineSimilarity(a: FeatureVector, b: FeatureVector): number {
  let dot = 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  let normA = 0;
  for (const va of a.values()) normA += va * va;
  let normB = 0;
  for (const vb of b.values()) normB += vb * vb;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function isNumberArray(x: unknown): x is number[] {
  return Array.isArray(x) && x.every((v) => typeof v === "number" && Number.isFinite(v));
}

// ── GraphQL queries ──────────────────────────────────────────────────────────

const MEDIA_FIELDS = `
  id idMal
  title { romaji english }
  averageScore
  startDate { year }
  coverImage { large }
  genres
  tags { name rank isMediaSpoiler }
`;

const BY_MAL_ID = `
  query ($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) { ${MEDIA_FIELDS} }
  }
`;

// Fetch a page of top-scored anime for a given tag name
const BY_TAG = `
  query ($tag: String, $page: Int) {
    Page(page: $page, perPage: 20) {
      media(tag: $tag, type: ANIME, sort: SCORE_DESC, format_in: [TV, TV_SHORT]) {
        ${MEDIA_FIELDS}
      }
    }
  }
`;

const RECOMMENDATIONS_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      recommendations(perPage: 15, sort: RATING_DESC) {
        nodes {
          rating
          mediaRecommendation { ${MEDIA_FIELDS} }
        }
      }
    }
  }
`;

// ── Route ────────────────────────────────────────────────────────────────────

type RecommendationItem = {
  id: number;          // AniList ID
  malId: number | null;
  title: string;
  imageUrl: string | null;
  score: number | null; // 0-100
  year: number | null;
  reason: string;
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const malIdsUnknown: unknown = body?.likedAnimeIds;
  const excludeUnknown: unknown = body?.excludeMalIds;

  if (!isNumberArray(malIdsUnknown) || malIdsUnknown.length === 0) {
    return NextResponse.json(
      { error: "likedAnimeIds must be a non-empty array of MAL IDs" },
      { status: 400 }
    );
  }

  const malIds = malIdsUnknown.slice(0, 15);
  const excludedMalIds = new Set<number>(isNumberArray(excludeUnknown) ? excludeUnknown : []);

  try {
    // 1) Resolve MAL IDs → AniList media (rich tag data)
    const seedMedia: AniListMedia[] = [];
    for (const idMal of malIds) {
      try {
        const data = await anilistQuery<{ Media: AniListMedia }>(BY_MAL_ID, { idMal });
        if (data.Media) seedMedia.push(data.Media);
      } catch {
        // skip IDs AniList doesn't know
      }
    }

    if (seedMedia.length === 0) {
      return NextResponse.json({ error: "Could not find any of those anime on AniList" }, { status: 400 });
    }

    // 2) Build user preference vector
    const userVector = sumVectors(seedMedia.map(vectorFromMedia));
    const seedTitles = seedMedia.map((m) => m.title.english ?? m.title.romaji).join(", ");
    const likedAnilistIds = new Set(seedMedia.map((m) => m.id));

    // Collect all genres/tags present in liked anime (for overlap text)
    const likedFeatureNames = new Set<string>();
    for (const [k] of userVector) likedFeatureNames.add(k);

    // 3) Candidate generation
    // candidateMap: anilist id → { media, bonus, why }
    const candidateMap = new Map<number, { media: AniListMedia; bonus: number; why: string }>();

    const addCandidate = (media: AniListMedia, bonus: number, why: string) => {
      if (!media) return;
      if (likedAnilistIds.has(media.id)) return;
      if (media.idMal != null && excludedMalIds.has(media.idMal)) return;
      const prev = candidateMap.get(media.id);
      if (!prev) {
        candidateMap.set(media.id, { media, bonus, why });
      } else {
        candidateMap.set(media.id, {
          media: prev.media,
          bonus: prev.bonus + bonus,
          why: prev.why.includes(why) ? prev.why : `${prev.why}, ${why}`,
        });
      }
    };

    // A) AniList recommendations for each seed
    for (const seed of seedMedia) {
      try {
        const data = await anilistQuery<{
          Media: {
            recommendations: {
              nodes: { rating: number; mediaRecommendation: AniListMedia | null }[];
            };
          };
        }>(RECOMMENDATIONS_QUERY, { id: seed.id });

        const nodes = data.Media?.recommendations?.nodes ?? [];
        for (const node of nodes) {
          const m = node.mediaRecommendation;
          if (!m) continue;
          const bonus = Math.min(12, 2 + Math.floor(node.rating / 10));
          addCandidate(m, bonus, `Recommended by fans of ${seed.title.english ?? seed.title.romaji}`);
        }
      } catch {
        // skip if recommendations unavailable
      }
    }

    // B) Tag-based candidates using top tags from user vector
    const topTags = Array.from(userVector.entries())
      .filter(([k]) => k.startsWith("tag:"))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k.slice(4)); // strip "tag:" prefix

    for (const tag of topTags) {
      try {
        const data = await anilistQuery<{ Page: { media: AniListMedia[] } }>(BY_TAG, {
          tag,
          page: 1,
        });
        for (const m of data.Page?.media ?? []) {
          addCandidate(m, 0, `Matches your top tag: ${tag}`);
        }
      } catch {
        // skip tag if it fails
      }
    }

    // 4) Score + rank
    const scored = Array.from(candidateMap.values())
      .map(({ media: m, bonus, why }) => {
        const candVec = vectorFromMedia(m);
        const sim = cosineSimilarity(userVector, candVec);
        const malScore = (m.averageScore ?? 0) / 10; // normalize 0-100 → 0-10
        const total = bonus + sim * 10 + malScore / 2;

        const overlap = [...m.genres.map((g) => `genre:${g}`)].filter((k) =>
          likedFeatureNames.has(k)
        ).map((k) => k.slice(6)); // strip "genre:"

        const overlapText = overlap.length > 0 ? overlap.slice(0, 3).join(", ") : "your picks";

        return {
          m,
          total,
          reason: `${why}. Because you liked ${seedTitles}. Similar in: ${overlapText} (similarity ${sim.toFixed(2)}).`,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map(
        ({ m, reason }): RecommendationItem => ({
          id: m.id,
          malId: m.idMal,
          title: m.title.english ?? m.title.romaji,
          imageUrl: m.coverImage.large,
          score: m.averageScore,
          year: m.startDate.year,
          reason,
        })
      );

    return NextResponse.json({ results: scored });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to compute recommendations", detail: String(err) },
      { status: 500 }
    );
  }
}
