import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  fetchSeasonalAnime,
  getCurrentSeason,
  isValidSeason,
} from "@/lib/malSeasonal";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const current = getCurrentSeason();

  const rawYear = searchParams.get("year");
  const rawSeason = searchParams.get("season");

  const year = rawYear === null ? current.year : Number(rawYear);
  const season = rawSeason === null ? current.season : rawSeason.toLowerCase();

  if (!Number.isInteger(year) || year < 1970 || year > current.year + 2) {
    return NextResponse.json(
      { error: `year must be an integer between 1970 and ${current.year + 2}` },
      { status: 400 }
    );
  }

  if (!isValidSeason(season)) {
    return NextResponse.json(
      { error: "season must be one of winter, spring, summer, fall" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("mal_access_token")?.value;

  try {
    const { items, authenticated } = await fetchSeasonalAnime({
      year,
      season,
      accessToken,
    });

    return NextResponse.json({
      year,
      season,
      current,
      items,
      authenticated,
    });
  } catch (err) {
    console.error("[/api/seasonal] error:", err);
    return NextResponse.json(
      { error: "Failed to fetch seasonal anime" },
      { status: 500 }
    );
  }
}
