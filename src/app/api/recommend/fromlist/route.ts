import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mal_access_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch completed list sorted by user score, grab enough to find top seeds
  const params = new URLSearchParams({
    status: "completed",
    sort: "list_score",
    limit: "50",
    fields: "list_status{score},main_picture",
  });

  const listRes = await fetch(
    `https://api.myanimelist.net/v2/users/@me/animelist?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!listRes.ok) {
    return NextResponse.json({ error: "Failed to fetch your anime list" }, { status: listRes.status });
  }

  const listData = await listRes.json();
  const entries: { node: { id: number; title: string; main_picture?: { medium: string } }; list_status: { score: number } }[] =
    listData.data ?? [];

  // Pick top 5 highest-scored entries as recommendation seeds
  const seeds = entries
    .filter((e) => e.list_status.score >= 7)
    .slice(0, 5);

  if (seeds.length === 0) {
    return NextResponse.json({ error: "No rated anime found in your completed list" }, { status: 400 });
  }

  const likedAnimeIds = seeds.map((e) => e.node.id);
  const seedInfo = seeds.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    imageUrl: e.node.main_picture?.medium ?? null,
    score: e.list_status.score,
  }));

  // Delegate to the existing recommend pipeline
  const baseUrl = new URL(request.url).origin;
  const recRes = await fetch(`${baseUrl}/api/recommend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ likedAnimeIds }),
  });

  const recData = await recRes.json();

  if (!recRes.ok) {
    return NextResponse.json(recData, { status: recRes.status });
  }

  return NextResponse.json({ ...recData, seeds: seedInfo });
}
