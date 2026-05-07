import Groq from "groq-sdk";

// Groq client. Reads GROQ_API_KEY from env at module load.
// Get a free key at https://console.groq.com/keys
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("GROQ_API_KEY must be set");
}

export const groq = new Groq({ apiKey: apiKey ?? "" });

// Default model — Llama 3.3 70B is free, smart, very fast on Groq.
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

// ── Schema for re-rank output ────────────────────────────────────────────────

export type RerankedItem = {
  id: number;        // anime id from the candidate list
  reason: string;    // 1-2 sentence personalized reason
};

export type SeedSummary = {
  title: string;
  user_score?: number; // 1-10 (only for MAL list mode)
};

export type CandidateSummary = {
  id: number;
  title: string;
  year: number | null;
  genres: string[];
  synopsis_excerpt: string;  // first ~300 chars
  similarity: number;        // 0-1 from embedding search
};

// ── Re-rank + reason generation ──────────────────────────────────────────────

export async function rerankWithReasons(opts: {
  seeds: SeedSummary[];
  userText?: string;
  candidates: CandidateSummary[];
  pickCount: number;
}): Promise<RerankedItem[]> {
  const { seeds, userText, candidates, pickCount } = opts;

  const system = `You are an expert anime recommender. The user has shared anime they like
(possibly with personal ratings). They may have written a note about what they're in the mood for.
You will be given ${candidates.length} candidate anime that semantically match their taste.

Your job:
1. Pick the ${pickCount} best candidates considering BOTH similarity to their picks AND any preferences/exclusions in their note.
2. For each pick, write ONE short, personal sentence (max 25 words) explaining why this fits.
   Reference their seed anime by name when relevant. Don't repeat genre lists.
3. If their note says they don't want something (e.g. "no romance"), exclude candidates that match.

Output strict JSON: {"results": [{"id": <number>, "reason": "<sentence>"}, ...]}.
Only return ${pickCount} items. Use only the IDs from the candidate list.`;

  const seedsText = seeds
    .map((s) => (s.user_score != null ? `• ${s.title} (rated ${s.user_score}/10)` : `• ${s.title}`))
    .join("\n");

  const candidatesText = candidates
    .map(
      (c) =>
        `[id=${c.id}] ${c.title} (${c.year ?? "?"}) — genres: ${c.genres.slice(0, 4).join(", ") || "—"}\n` +
        `  similarity=${(c.similarity * 100).toFixed(0)}%\n` +
        `  ${c.synopsis_excerpt}`
    )
    .join("\n\n");

  const user =
    `## What the user likes\n${seedsText}\n\n` +
    (userText ? `## User's note\n${userText.trim()}\n\n` : "") +
    `## Candidates\n${candidatesText}`;

  const completion = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.results)) {
    throw new Error("Groq response missing 'results' array");
  }

  const valid: RerankedItem[] = [];
  for (const r of parsed.results) {
    if (
      typeof r === "object" &&
      r !== null &&
      "id" in r &&
      "reason" in r &&
      typeof (r as { id: unknown }).id === "number" &&
      typeof (r as { reason: unknown }).reason === "string"
    ) {
      valid.push({ id: (r as { id: number }).id, reason: (r as { reason: string }).reason });
    }
  }

  return valid;
}
