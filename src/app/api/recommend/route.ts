import { NextResponse } from "next/server";

/**
 * This endpoint is a STUB (starter version).
 * It returns dummy recommendations so we can test the frontend-backend connection.
 *
 * Next step: replace dummy data with real logic.
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const likedAnimeIds: unknown = body?.likedAnimeIds;

  // Validate input (beginner important!)
  if (!Array.isArray(likedAnimeIds) || likedAnimeIds.length === 0) {
    return NextResponse.json(
      { error: "likedAnimeIds must be a non-empty array" },
      { status: 400 }
    );
  }

  // Dummy results for now (we'll make it real next)
  const results = [
    {
      id: 1,
      title: "Demo Recommendation A",
      imageUrl: null,
      score: null,
      year: null,
      reason: "Starter placeholder. Next we will compute real recommendations.",
    },
    {
      id: 2,
      title: "Demo Recommendation B",
      imageUrl: null,
      score: null,
      year: null,
      reason: "This confirms your frontend can POST selected anime IDs to the backend.",
    },
  ];

  return NextResponse.json({ results });
}