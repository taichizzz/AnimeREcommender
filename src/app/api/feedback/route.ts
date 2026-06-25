import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST body:
//   { animeMalId: number,
//     signal: "up" | "down" | "not_interested" | "none",   // "none" clears the reaction
//     userKey: string,                                       // 'anon:<uuid>' from the client
//     seedMalIds?: number[],                                 // optional context
//     engineUsed?: string }                                  // optional context
//
// Records into the `feedback` table (see ml/schema_feedback.sql). One row per
// (userKey, animeMalId) — re-reacting upserts, "none" deletes.

const SIGNALS = new Set(["up", "down", "not_interested", "none"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const animeMalId = body?.animeMalId;
  const signal = body?.signal;
  const userKey = typeof body?.userKey === "string" ? body.userKey.slice(0, 80) : null;

  if (typeof animeMalId !== "number" || !Number.isFinite(animeMalId)) {
    return NextResponse.json({ error: "animeMalId (number) required" }, { status: 400 });
  }
  if (typeof signal !== "string" || !SIGNALS.has(signal)) {
    return NextResponse.json(
      { error: "signal must be one of up | down | not_interested | none" },
      { status: 400 }
    );
  }
  if (!userKey) {
    return NextResponse.json({ error: "userKey required" }, { status: 400 });
  }

  try {
    // Clear the reaction.
    if (signal === "none") {
      const { error } = await supabase
        .from("feedback")
        .delete()
        .eq("user_key", userKey)
        .eq("anime_mal_id", animeMalId);
      if (error) throw error;
      return NextResponse.json({ ok: true, signal: null });
    }

    // Optional context.
    const seedMalIds = Array.isArray(body?.seedMalIds)
      ? body.seedMalIds.filter((x: unknown) => typeof x === "number").slice(0, 20)
      : null;
    const engineUsed = typeof body?.engineUsed === "string" ? body.engineUsed.slice(0, 20) : null;

    const { error } = await supabase.from("feedback").upsert(
      {
        user_key: userKey,
        anime_mal_id: animeMalId,
        signal,
        seed_mal_ids: seedMalIds,
        engine_used: engineUsed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_key,anime_mal_id" }
    );
    if (error) throw error;

    return NextResponse.json({ ok: true, signal });
  } catch (err) {
    // Log server-side, return a generic message (don't leak internals to the client).
    console.error("[/api/feedback] error:", err);
    return NextResponse.json({ error: "Failed to record feedback" }, { status: 500 });
  }
}
