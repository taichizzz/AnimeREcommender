import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

type MALEntry = {
  node: { id: number; title: string; main_picture?: { medium: string } };
  list_status: { score: number };
};

async function fetchAllMALList(token: string, status: string): Promise<MALEntry[]> {
  const fields = "list_status{score},main_picture";
  let url: string | null =
    `https://api.myanimelist.net/v2/users/@me/animelist?status=${status}&sort=list_score&limit=100&fields=${fields}`;

  const all: MALEntry[] = [];
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data: { data?: MALEntry[]; paging?: { next?: string } } = await res.json();
    all.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return all;
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("mal_access_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Fetch completed list (all pages) + watching list in parallel
  const [completed, watching] = await Promise.all([
    fetchAllMALList(token, "completed"),
    fetchAllMALList(token, "watching"),
  ]);

  if (completed.length === 0) {
    return NextResponse.json({ error: "No completed anime found in your list" }, { status: 400 });
  }

  // All watched IDs to exclude from recommendations
  const excludeMalIds = [
    ...completed.map((e) => e.node.id),
    ...watching.map((e) => e.node.id),
  ];

  // Seeds: top 15 highest-rated completed anime (score ≥ 7), weighted by score
  const seeds = completed
    .filter((e) => e.list_status.score >= 7)
    .slice(0, 15);

  if (seeds.length === 0) {
    return NextResponse.json(
      { error: "No highly-rated anime found — rate some completed anime (7+) to get recommendations" },
      { status: 400 }
    );
  }

  const likedAnimeIds = seeds.map((e) => e.node.id);

  // Show top 5 as display seeds in the UI
  const seedInfo = seeds.slice(0, 5).map((e) => ({
    id: e.node.id,
    title: e.node.title,
    imageUrl: e.node.main_picture?.medium ?? null,
    score: e.list_status.score,
  }));

  const baseUrl = new URL(request.url).origin;
  const recRes = await fetch(`${baseUrl}/api/recommend/anilist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ likedAnimeIds, excludeMalIds }),
  });

  const recData = await recRes.json();

  if (!recRes.ok) {
    return NextResponse.json(recData, { status: recRes.status });
  }

  return NextResponse.json({ ...recData, seeds: seedInfo });
}
