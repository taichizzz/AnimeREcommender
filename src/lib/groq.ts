import Groq from "groq-sdk";

// Groq client. Reads GROQ_API_KEY from env at module load.
// Get a free key at https://console.groq.com/keys
const apiKey = process.env.GROQ_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  throw new Error("GROQ_API_KEY must be set");
}

export const groq = new Groq({ apiKey: apiKey ?? "" });

// Two-stage models (both free on Groq):
//  • SELECT_MODEL  — a reasoning model does the judgment-heavy selection.
//  • WRITE_MODEL   — a strong instruct/writer model polishes the prose reasons.
export const SELECT_MODEL = "openai/gpt-oss-120b";
export const WRITE_MODEL = "llama-3.3-70b-versatile";

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

// A pick coming out of stage 1: the chosen anime + a short internal rationale
// (plain notes on WHY it fits — not the final user-facing copy).
type SelectedPick = { id: number; rationale: string };

// ── Shared prompt fragments ──────────────────────────────────────────────────

function buildSeedsText(seeds: SeedSummary[]): string {
  return seeds
    .map((s) => {
      const tag = s.is_favorite ? " ⭐ FAVORITE" : "";
      const score = s.user_score != null ? ` (rated ${s.user_score}/10)` : "";
      return `• ${s.title}${score}${tag}`;
    })
    .join("\n");
}

function buildQuizParts(quiz?: QuizSignals): string[] {
  const parts: string[] = [];
  if (quiz?.hookedBy) parts.push(`HOOKED BY: ${quiz.hookedBy}`);
  if (quiz?.mood && quiz.mood.length > 0) parts.push(`MOOD: ${quiz.mood.join(", ")}`);
  if (quiz?.dislikes && quiz.dislikes.length > 0) parts.push(`DOES NOT WANT: ${quiz.dislikes.join(", ")}`);
  return parts;
}

function parseJsonObject(raw: string): { thinking?: unknown; results?: unknown } {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Groq returned invalid JSON: ${raw.slice(0, 200)}`);
  }
}

// ── Stage 1: selection (reasoning model) ─────────────────────────────────────
// Picks the best `pickCount` candidates, ordered best-first, and emits a short
// internal rationale per pick. Sees only SHORT synopses so the prompt stays small.

async function selectCandidates(opts: {
  seeds: SeedSummary[];
  userText?: string;
  quiz?: QuizSignals;
  candidates: CandidateSummary[];
  pickCount: number;
}): Promise<{ thinking: string; picks: SelectedPick[] }> {
  const { seeds, userText, quiz, candidates, pickCount } = opts;

  const system = `You are a discerning anime recommender. You receive a user's taste profile and ${candidates.length} candidate anime. Select the ${pickCount} that genuinely fit this user, ordered best-first, and give a SHORT plain-language rationale for each (these are internal notes, not final copy).

═══════════════════════════════════════════════════
HARD RULES — never violate these
═══════════════════════════════════════════════════
1. Never pick a sequel, prequel, or spin-off of any anime in the user's seeds OR of another candidate. Always choose the FIRST entry of a series.
2. Never pick a recap, summary, OVA-only, or compilation movie.
3. If the user's dislikes mention something explicit (e.g. "no romance", "no sad endings", "no ecchi"), exclude any candidate that prominently features it. When in doubt, drop it.

═══════════════════════════════════════════════════
SELECTION PRIORITIES
═══════════════════════════════════════════════════
• Honor what hooked them (story / atmosphere / characters) and their stated mood.
• Favor genuine tonal/thematic fit over surface genre overlap.
• Spread the picks across distinct experiences — avoid 10 near-identical shows.

RATIONALE: for each pick, one short clause (max 20 words) LINKING the anime to this user's taste — name a specific seed they rated highly (or what hooked them / their mood) AND the concrete element of this anime that delivers it. No bare descriptions, no genre lists.

═══════════════════════════════════════════════════
OUTPUT
═══════════════════════════════════════════════════
Return strict JSON in this exact shape:
{
  "thinking": "<2-3 sentences: what you noticed about the user's taste and how that shaped your picks. Be honest and specific. Mention any tradeoffs you made.>",
  "results": [{"id": <int>, "rationale": "<short clause>"}, ...]
}
Exactly ${pickCount} items, ordered best to worst fit. Use only IDs from the candidate list.`;

  const quizParts = buildQuizParts(quiz);
  const candidatesText = candidates
    .map((c) => {
      const score = c.avg_score != null ? ` ${c.avg_score}%` : "";
      return (
        `[id=${c.id}] ${c.title} (${c.year ?? "?"})${score}\n` +
        `  Genres: ${c.genres.join(", ") || "—"}\n` +
        `  Top tags: ${c.top_tags.slice(0, 6).join(", ") || "—"}\n` +
        `  Synopsis: ${c.synopsis_excerpt.slice(0, 180)}`
      );
    })
    .join("\n\n");

  const user =
    `## What the user likes\n${buildSeedsText(seeds)}\n\n` +
    (quizParts.length > 0 ? `## Quiz answers\n${quizParts.join("\n")}\n\n` : "") +
    (userText ? `## Note from user\n${userText.trim()}\n\n` : "") +
    `## Candidates\n${candidatesText}`;

  console.log("\n═══════════════ STAGE 1 (SELECT) PROMPT ═══════════════");
  console.log("--- SYSTEM ---\n" + system);
  console.log("\n--- USER MESSAGE ---\n" + user);
  console.log("═══════════════════════════════════════════════════════\n");

  const completion = await groq.chat.completions.create({
    model: SELECT_MODEL,
    temperature: 0.4,
    reasoning_effort: "low", // judgment task, but we don't need deep chain-of-thought
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  console.log("\n═══════════════ STAGE 1 (SELECT) RESPONSE ═══════════════");
  console.log(raw);
  console.log("═════════════════════════════════════════════════════════\n");

  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed.results)) {
    throw new Error("Stage 1 response missing 'results' array");
  }

  const picks: SelectedPick[] = [];
  for (const r of parsed.results) {
    if (
      typeof r === "object" &&
      r !== null &&
      typeof (r as { id: unknown }).id === "number"
    ) {
      const id = (r as { id: number }).id;
      const rationale =
        typeof (r as { rationale: unknown }).rationale === "string"
          ? (r as { rationale: string }).rationale
          : "";
      picks.push({ id, rationale });
    }
  }

  const thinking = typeof parsed.thinking === "string" ? parsed.thinking : "";
  return { thinking, picks: picks.slice(0, pickCount) };
}

// ── Stage 2: reason writing (writer model) ───────────────────────────────────
// Takes the final picks with FULL context + stage-1 rationale and turns each
// into one vivid, specific sentence. Small prompt (only `pickCount` items).

async function writeReasons(opts: {
  seeds: SeedSummary[];
  userText?: string;
  quiz?: QuizSignals;
  picks: { candidate: CandidateSummary; rationale: string }[];
}): Promise<Map<number, string>> {
  const { seeds, userText, quiz, picks } = opts;

  const system = `You are writing the "why we picked this for you" line under each anime recommendation. For each anime you get an internal rationale, the anime's full details (synopsis, tags), and the user's profile. Write ONE reason, addressed to this user, explaining why THIS anime suits THEM.

═══════════════════════════════════════════════════
THE BAR — every reason must pass the SWAP TEST
═══════════════════════════════════════════════════
If your sentence would still make sense pasted under a DIFFERENT anime, it has FAILED — rewrite it. A reason must be impossible to recycle.

To pass, do BOTH:
1. NAME ONE SPECIFIC, CONCRETE THING from THIS anime's synopsis — a named character and their situation, the actual premise or mechanic, the specific stake or twist. An actual detail, not a vibe.
2. CONNECT IT TO THE USER — to a specific seed they rated highly, what hooked them (story / atmosphere / characters), or their mood — in a way that feels earned and is phrased differently each time (do NOT repeat the same connector line).

═══════════════════════════════════════════════════
BANNED — empty filler that says nothing
═══════════════════════════════════════════════════
Never use these hollow words/phrases: engaging, gripping, immersive, epic, thrilling, captivating, high-octane, fast-paced, action-packed, adventure-filled, rich, deep, intense, compelling, "story arc", "will appeal to", "a great fit", "matches your preferences", "keeps you engaged".
Also banned: "Similar to X", "Shares [genre] with X", and bare genre lists.

═══════════════════════════════════════════════════
BAD → GOOD (study the difference)
═══════════════════════════════════════════════════
✗ "DanMachi's adventure-filled action and engaging story arc will appeal to your story-driven preferences."
✓ "DanMachi follows Bell, the dungeon's weakest solo adventurer grinding to repay the lonely goddess who staked her whole familia on him — that underdog-with-real-stakes setup is your kind of story."

✗ "Steins;Gate's gripping plot is a great fit for your taste."
✓ "Since you rated Fate/stay night a 10 for its story, you'll fall for how Steins;Gate turns a joke microwave-time-machine into a desperate loop where every rewind kills the girl he's trying to save."

═══════════════════════════════════════════════════
STYLE
═══════════════════════════════════════════════════
One complete sentence, 20–35 words. Conversational, concrete, confident. Lead with the substance — no throat-clearing ("This anime…", "If you liked…").

Return strict JSON: { "results": [{"id": <int>, "reason": "<sentence>"}, ...] } — one per anime, same IDs.`;

  const quizParts = buildQuizParts(quiz);
  const picksText = picks
    .map(({ candidate: c, rationale }) => {
      const score = c.avg_score != null ? ` ${c.avg_score}%` : "";
      return (
        `[id=${c.id}] ${c.title} (${c.year ?? "?"})${score}\n` +
        `  Why chosen (rationale): ${rationale || "—"}\n` +
        `  Genres: ${c.genres.join(", ") || "—"}\n` +
        `  Top tags: ${c.top_tags.slice(0, 10).join(", ") || "—"}\n` +
        `  Synopsis: ${c.synopsis_excerpt}`
      );
    })
    .join("\n\n");

  const user =
    `## What the user likes\n${buildSeedsText(seeds)}\n\n` +
    (quizParts.length > 0 ? `## Quiz answers\n${quizParts.join("\n")}\n\n` : "") +
    (userText ? `## Note from user\n${userText.trim()}\n\n` : "") +
    `## Picks to write reasons for\n${picksText}`;

  console.log("\n═══════════════ STAGE 2 (WRITE) PROMPT ═══════════════");
  console.log("--- SYSTEM ---\n" + system);
  console.log("\n--- USER MESSAGE ---\n" + user);
  console.log("══════════════════════════════════════════════════════\n");

  const completion = await groq.chat.completions.create({
    model: WRITE_MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  console.log("\n═══════════════ STAGE 2 (WRITE) RESPONSE ═══════════════");
  console.log(raw);
  console.log("════════════════════════════════════════════════════════\n");

  const parsed = parseJsonObject(raw);
  if (!Array.isArray(parsed.results)) {
    throw new Error("Stage 2 response missing 'results' array");
  }

  const reasonById = new Map<number, string>();
  for (const r of parsed.results) {
    if (
      typeof r === "object" &&
      r !== null &&
      typeof (r as { id: unknown }).id === "number" &&
      typeof (r as { reason: unknown }).reason === "string"
    ) {
      reasonById.set((r as { id: number }).id, (r as { reason: string }).reason);
    }
  }
  return reasonById;
}

// ── Public orchestrator: two-stage select → write ────────────────────────────

export async function rerankWithReasons(opts: {
  seeds: SeedSummary[];
  userText?: string;
  quiz?: QuizSignals;
  candidates: CandidateSummary[];
  pickCount: number;
}): Promise<RerankResponse> {
  const { seeds, userText, quiz, candidates, pickCount } = opts;

  // Stage 1 — reasoning model selects + orders + emits rationales.
  const { thinking, picks } = await selectCandidates({
    seeds,
    userText,
    quiz,
    candidates,
    pickCount,
  });

  if (picks.length === 0) return { thinking, results: [] };

  // Attach each pick's full candidate data for the richer stage-2 prompt.
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const picksForWrite = picks.flatMap((p) => {
    const candidate = byId.get(p.id);
    return candidate ? [{ candidate, rationale: p.rationale }] : [];
  });

  // Stage 2 — writer model turns rationales into vivid prose.
  // If it fails (rate limit, bad JSON, etc.), gracefully fall back to the
  // stage-1 rationale so the user still gets an LLM-grounded reason.
  let reasonById = new Map<number, string>();
  try {
    reasonById = await writeReasons({ seeds, userText, quiz, picks: picksForWrite });
  } catch (err) {
    console.warn("[groq] stage 2 (writeReasons) failed, falling back to rationale:", err);
  }

  const results: RerankedItem[] = picksForWrite.map(({ candidate, rationale }) => ({
    id: candidate.id,
    reason: reasonById.get(candidate.id) ?? rationale,
  }));

  return { thinking, results };
}
