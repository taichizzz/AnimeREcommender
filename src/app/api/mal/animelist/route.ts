import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mal_access_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fields = "list_status{score},mean,genres,num_episodes,main_picture";
  const allAnime = [];

  // MAL caps each page at 100 — keep fetching until there is no next page
  let url: string | null =
    `https://api.myanimelist.net/v2/users/@me/animelist?status=completed&sort=list_score&limit=100&fields=${fields}`;

  while (url) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch anime list" }, { status: res.status });
    }

    const data: { data?: unknown[]; paging?: { next?: string } } = await res.json();
    allAnime.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }

  return NextResponse.json({ anime: allAnime });
}
