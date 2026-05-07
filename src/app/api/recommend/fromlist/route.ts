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

  // Optional natural-language preferences from the user (forwarded to Groq)
  const body = await request.json().catch(() => null);
  const userText: unknown = body?.userText;

  const [completed, watching] = await Promise.all([
    fetchAllMALList(token, "completed"),
    fetchAllMALList(token, "watching"),
  ]);

  if (completed.length === 0) {
    return NextResponse.json({ error: "No completed anime found in your list" }, { status: 400 });
  }

  // All watched IDs (excluded from recommendations regardless of rating)
  const excludeMalIds = [
    ...completed.map((e) => e.node.id),
    ...watching.map((e) => e.node.id),
  ];

  // Use the user's ENTIRE rated history as signal — low scores are negative,
  // high scores are positive. The pgvector RPC weights them as (score - 6.5),
  // so a 10 pulls strongly toward similar anime, a 3 pushes away.
  const rated = completed.filter((e) => e.list_status.score > 0);

  if (rated.length === 0) {
    return NextResponse.json(
      { error: "No rated anime found — rate some completed anime to get personalized recommendations" },
      { status: 400 }
    );
  }

  const likedAnimeIds = rated.map((e) => e.node.id);
  const likedScores = rated.map((e) => e.list_status.score);

  console.log(
    `[fromlist] Using ALL ${rated.length} rated anime as signal ` +
    `(${rated.filter((e) => e.list_status.score >= 7).length} positive, ` +
    `${rated.filter((e) => e.list_status.score < 6).length} negative). ` +
    `Excluding ${excludeMalIds.length} watched/watching from results.`
  );

  // Show top 5 highest-rated as display seeds in the UI
  const seedInfo = [...rated]
    .sort((a, b) => b.list_status.score - a.list_status.score)
    .slice(0, 5)
    .map((e) => ({
      id: e.node.id,
      title: e.node.title,
      imageUrl: e.node.main_picture?.medium ?? null,
      score: e.list_status.score,
    }));

  const baseUrl = new URL(request.url).origin;
  const recRes = await fetch(`${baseUrl}/api/recommend/v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ likedAnimeIds, likedScores, excludeMalIds, userText }),
  });

  const recData = await recRes.json();

  if (!recRes.ok) {
    return NextResponse.json(recData, { status: recRes.status });
  }

  return NextResponse.json({ ...recData, seeds: seedInfo });
}
