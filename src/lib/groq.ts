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

export type RerankResponse = {
  thinking: string;     // overall reasoning — what the LLM concluded about the user
  results: RerankedItem[];
};

export type SeedSummary = {
  title: string;
  user_score?: number;       // 1-10 (only for MAL list mode)
  is_favorite?: boolean;     // user's #1 from quiz
};

export type CandidateSummary = {
  id: number;
  title: string;
  year: number | null;
  genres: string[];
  top_tags: string[];        // top weighted tags from AniList (rank ≥ 60)
  synopsis_excerpt: string;  // up to 600 chars
  similarity: number;        // 0-1 from embedding search
  avg_score: number | null;
};

export type QuizSignals = {
  hookedBy?: string;         // "story" | "atmosphere" | "characters" | freeform
  mood?: string[];           // ["Mind-bending", "Emotional", ...]
  dislikes?: string[];       // ["Romance focus", "Sad endings", ...]
};

// ── Re-rank + reason generation ──────────────────────────────────────────────

export async function rerankWithReasons(opts: {
  seeds: SeedSummary[];
  userText?: string;
  quiz?: QuizSignals;
  candidates: CandidateSummary[];
  pickCount: number;
}): Promise<RerankResponse> {
  const { seeds, userText, quiz, candidates, pickCount } = opts;

  const system = `You are a thoughtful anime recommender. You receive a user's profile and ${candidates.length} candidate anime. Your task is to select the ${pickCount} that genuinely fit them and write a SPECIFIC, PERSONAL reason for each.

═══════════════════════════════════════════════════
HARD RULES — never violate these
═══════════════════════════════════════════════════
1. Never recommend a sequel, prequel, or spin-off of any anime in the user's seeds OR of any other candidate. Always choose the FIRST entry of a series.
2. Never recommend a recap, summary, OVA-only, or compilation movie.
3. If the user's dislikes mention something explicit (e.g. "no romance", "no sad endings", "no ecchi"), exclude any candidate that prominently features it. When in doubt, drop it.

═══════════════════════════════════════════════════
REASONING RULES — these matter as much as the picks
═══════════════════════════════════════════════════
GOAL: each reason is one specific sentence that could ONLY apply to this user, this anime, this moment.

BANNED phrasings (these are the templates we're trying to escape):
  ✗ "Similar to X, with Y and Z"
  ✗ "Shares [genre] elements with X"
  ✗ "Combines [trait] and [trait] like X"
  ✗ "Has [trait] like X"
  ✗ "Features a similar atmosphere to X"
  ✗ Any sentence that just lists genres or pairs the candidate with a seed by similarity

GOOD reasons mention concrete things:
  ✓ A specific narrative device or plot mechanic
  ✓ A specific tone (e.g. "quiet melancholy", "dry comedy", "kinetic urgency")
  ✓ A specific theme the candidate handles in a particular way
  ✓ A specific quality the user said they care about (from "what hooked you")
  ✓ Why THIS picks fits THEIR mood — not just "matches X genre"

If the user said they were hooked by characters, talk about characters in the candidate.
If they said atmosphere, talk about pacing/mood/visual feel of the candidate.
If they said story, talk about the narrative shape or stakes.

LENGTH: 1 sentence, max 28 words. No leading throat-clearing ("This anime…", "If you liked…"). Lead with the substance.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════
Return strict JSON in this exact shape:
{
  "thinking": "<2-3 sentences: what you noticed about the user's taste and how that shaped your picks. Be honest and specific. Mention any tradeoffs you made.>",
  "results": [{"id": <int>, "reason": "<sentence>"}, ...]
}
Exactly ${pickCount} items in results. Use only IDs from the candidate list. Order from best to worst fit.`;

  // Build the user message
  const seedsText = seeds
    .map((s) => {
      const tag = s.is_favorite ? " ⭐ FAVORITE" : "";
      const score = s.user_score != null ? ` (rated ${s.user_score}/10)` : "";
      return `• ${s.title}${score}${tag}`;
    })
    .join("\n");

  const quizParts: string[] = [];
  if (quiz?.hookedBy) {
    quizParts.push(`HOOKED BY: ${quiz.hookedBy}`);
  }
  if (quiz?.mood && quiz.mood.length > 0) {
    quizParts.push(`MOOD: ${quiz.mood.join(", ")}`);
  }
  if (quiz?.dislikes && quiz.dislikes.length > 0) {
    quizParts.push(`DOES NOT WANT: ${quiz.dislikes.join(", ")}`);
  }

  const candidatesText = candidates
    .map((c) => {
      const score = c.avg_score != null ? ` ${c.avg_score}%` : "";
      return (
        `[id=${c.id}] ${c.title} (${c.year ?? "?"})${score}\n` +
        `  Genres: ${c.genres.join(", ") || "—"}\n` +
        `  Top tags: ${c.top_tags.slice(0, 8).join(", ") || "—"}\n` +
        `  Synopsis: ${c.synopsis_excerpt}`
      );
    })
    .join("\n\n");

  const user =
    `## What the user likes\n${seedsText}\n\n` +
    (quizParts.length > 0 ? `## Quiz answers\n${quizParts.join("\n")}\n\n` : "") +
    (userText ? `## Note from user\n${userText.trim()}\n\n` : "") +
    `## Candidates\n${candidatesText}`;

  // Verbose logging so the developer can see exactly what Groq sees
  console.log("\n═══════════════════ GROQ PROMPT ═══════════════════");
  console.log("--- SYSTEM ---\n" + system);
  console.log("\n--- USER MESSAGE ---\n" + user);
  console.log("═══════════════════════════════════════════════════\n");

  const completion = await groq.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  console.log("\n═══════════════════ GROQ RESPONSE ═══════════════════");
  console.log(raw);
  console.log("═════════════════════════════════════════════════════\n");

  let parsed: { thinking?: unknown; results?: unknown };
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

  const thinking = typeof parsed.thinking === "string" ? parsed.thinking : "";

  return { thinking, results: valid };
}
