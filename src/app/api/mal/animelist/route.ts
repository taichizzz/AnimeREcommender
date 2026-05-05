import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("mal_access_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = new URLSearchParams({
    status: "completed",
    sort: "list_score",
    limit: "100",
    fields: "list_status{score},mean,genres,num_episodes,main_picture",
  });

  const res = await fetch(
    `https://api.myanimelist.net/v2/users/@me/animelist?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch anime list" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json({ anime: data.data ?? [] });
}
