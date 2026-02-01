import { NextResponse } from "next/server";
import { jikanGet } from "@/lib/jikan";

/**
 * We define types for only the fields we use.
 * That’s enough for TypeScript to help us safely.
 */
type JikanAnime = {
  mal_id: number;
  title: string;
  synopsis: string | null;
  score: number | null;
  year: number | null;
  images: {
    jpg?: { image_url?: string };
  };
};

type JikanSearchResponse = {
  data: JikanAnime[];
};

export async function GET(request: Request) {
  // Get the URL query parameter: /api/search?q=naruto
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  // If user didn’t provide q, return error with status 400
  if (!q) {
    return NextResponse.json(
      { error: "Missing query parameter. Use /api/search?q=naruto" },
      { status: 400 }
    );
  }

  try {
    // Call Jikan search endpoint
    const json = await jikanGet<JikanSearchResponse>(
      `/anime?q=${encodeURIComponent(q)}&limit=10`
    );

    // Convert to a clean format for your frontend
    const results = json.data.map((a) => ({
      id: a.mal_id,
      title: a.title,
      synopsis: a.synopsis,
      imageUrl: a.images?.jpg?.image_url ?? null,
      score: a.score,
      year: a.year,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    // Something failed (network, rate limit, etc.)
    return NextResponse.json(
      { error: "Failed to fetch from Jikan", detail: String(err) },
      { status: 500 }
    );
  }
}