// Recommendation-quality eval harness.
//
// Runs a fixed set of taste profiles through the live /api/recommend/v2
// endpoint and checks the output against hard rules + tracked metrics, so you
// can tell whether a change made recommendations better or worse — with
// evidence, not vibes.
//
// Usage:
//   1. Start the app:   npm run dev
//   2. Run the eval:     npm run eval
//      (or: node scripts/eval.mjs  [--save-baseline] [--url http://localhost:3000])
//
// --save-baseline writes the current run to scripts/eval-baseline.json. On
// later runs, metrics are diffed against that baseline so regressions show up.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = path.join(__dirname, "eval-baseline.json");

const args = process.argv.slice(2);
const SAVE_BASELINE = args.includes("--save-baseline");
const urlIdx = args.indexOf("--url");
const BASE_URL = (urlIdx >= 0 && args[urlIdx + 1]) || process.env.APP_URL || "http://localhost:3000";

// Mirror of DISLIKE_GENRE_MAP in src/app/api/recommend/v2/route.ts — keep in sync.
const DISLIKE_GENRE_MAP = {
  "Romance focus": ["Romance"],
  "Sports": ["Sports"],
  "Slice-of-life": ["Slice of Life"],
  "Ecchi/fanservice": ["Ecchi"],
  "Mecha": ["Mecha"],
};

// ── Fixed taste profiles ─────────────────────────────────────────────────────
// seeds are MAL IDs. expectModern = this profile's taste is modern, so we expect
// the results to contain recent anime (a coverage check for the freshness gap).
const PROFILES = [
  { name: "modern_shounen",    seeds: [40748, 38000], seedTitles: ["Jujutsu Kaisen", "Kimetsu no Yaiba"],     quiz: { mood: ["Action"] }, expectModern: true },
  { name: "modern_mixed",      seeds: [52991, 44511], seedTitles: ["Sousou no Frieren", "Chainsaw Man"],       quiz: { mood: ["Action", "Emotional"] }, expectModern: true },
  { name: "classic_canon",     seeds: [1, 1535],      seedTitles: ["Cowboy Bebop", "Death Note"],              quiz: { hookedBy: "story" } },
  { name: "shounen_classic",   seeds: [5114, 11061],  seedTitles: ["Fullmetal Alchemist Brotherhood", "Hunter x Hunter"], quiz: { mood: ["Action"] } },
  { name: "mecha",             seeds: [1575, 2001],   seedTitles: ["Code Geass", "Tengen Toppa Gurren Lagann"], quiz: {} },
  { name: "slice_of_life",     seeds: [5680],         seedTitles: ["K-On!"],                                   quiz: { mood: ["Chill", "Wholesome"] } },
  { name: "isekai_no_romance", seeds: [31240, 30831], seedTitles: ["Re:Zero", "Kono Subarashii Sekai"],        quiz: { dislikes: ["Romance focus"] } },
  { name: "dark_psych",        seeds: [9253, 13601],  seedTitles: ["Steins;Gate", "Psycho-Pass"],              quiz: { hookedBy: "story", mood: ["Mind-bending"] } },
  { name: "sports_hater",      seeds: [1535, 5114],   seedTitles: ["Death Note", "Fullmetal Alchemist Brotherhood"], quiz: { dislikes: ["Sports"] } },
  { name: "romance",           seeds: [4224, 23273],  seedTitles: ["Toradora!", "Shigatsu wa Kimi no Uso"],    quiz: { mood: ["Emotional", "Romantic"] } },
  { name: "seinen",            seeds: [37521, 19],    seedTitles: ["Vinland Saga", "Monster"],                 quiz: { hookedBy: "characters" } },
  { name: "fate_franchise",    seeds: [356],          seedTitles: ["Fate/stay night"],                         quiz: {} },
];

// ── Heuristics ───────────────────────────────────────────────────────────────

const STOPWORDS = new Set(["the", "a", "an", "my", "no", "to", "is", "of", "and", "in", "for"]);

// A coarse "franchise signature": normalize, strip season/part/subtitle markers,
// return the leading significant words. Used to (a) measure diversity and (b)
// flag results that are likely the same franchise as a seed (the Fate leak).
function franchiseKey(title) {
  let t = (title || "").toLowerCase();
  t = t.split(/[:：]| - | – /)[0];
  t = t
    .replace(/\b(season|part|cour)\s*\d+\b/g, " ")
    .replace(/\b\d+(st|nd|rd|th)\s+season\b/g, " ")
    .replace(/\b(2nd|3rd|final|movie|ova|specials?)\b/g, " ")
    .replace(/\b(ii|iii|iv|v|vi|vii)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = t.split(" ").filter((w) => w && !STOPWORDS.has(w));
  return words.slice(0, 2).join(" "); // first two significant words
}

// Likely same franchise as a seed: shares the first two significant words, OR
// shares a single distinctive (length >= 4) first word.
function sharesFranchise(aKey, bKey) {
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  const a = aKey.split(" ");
  const b = bKey.split(" ");
  return a[0] === b[0] && a[0].length >= 4;
}

// ── API call ─────────────────────────────────────────────────────────────────

async function recommend(profile) {
  const res = await fetch(`${BASE_URL}/api/recommend/v2`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      likedAnimeIds: profile.seeds,
      likedScores: profile.seeds.map(() => 10),
      quiz: profile.quiz ?? {},
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// ── Per-profile scoring ──────────────────────────────────────────────────────

function evaluate(profile, data, seedTitles) {
  const results = data.results ?? [];
  const seedKeys = seedTitles.map(franchiseKey);

  const forbidden = new Set();
  for (const d of profile.quiz?.dislikes ?? []) {
    for (const g of DISLIKE_GENRE_MAP[d] ?? []) forbidden.add(g.toLowerCase());
  }

  let modern = 0;
  let dislikeViolations = 0;
  let franchiseLeaks = 0;
  const franchises = new Set();

  for (const r of results) {
    if ((r.year ?? 0) >= 2019) modern++;
    const genres = (r.genres ?? []).map((g) => g.toLowerCase());
    if (genres.some((g) => forbidden.has(g))) dislikeViolations++;
    const fk = franchiseKey(r.title);
    franchises.add(fk);
    if (seedKeys.some((sk) => sharesFranchise(sk, fk))) franchiseLeaks++;
  }

  const metrics = {
    count: results.length,
    engineUsed: data.engineUsed ?? "?",
    modern,
    distinctFranchises: franchises.size,
    franchiseLeaks,
    dislikeViolations,
  };

  // Hard rules → pass/fail.
  const failures = [];
  if (results.length < 8) failures.push(`only ${results.length} results (<8)`);
  if (dislikeViolations > 0) failures.push(`${dislikeViolations} disliked-genre result(s)`);
  if (profile.expectModern && modern < 3) failures.push(`only ${modern} modern (2019+) result(s) for modern taste`);

  return { metrics, failures };
}

// ── Run ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nEval harness → ${BASE_URL}/api/recommend/v2\n`);

  const rows = [];
  let totalFail = 0;

  for (const p of PROFILES) {
    process.stdout.write(`• ${p.name.padEnd(20)} `);
    try {
      const data = await recommend(p);
      const { metrics, failures } = evaluate(p, data, p.seedTitles ?? []);
      const ok = failures.length === 0;
      if (!ok) totalFail++;
      rows.push({ name: p.name, ...metrics, pass: ok, failures });
      console.log(
        `${ok ? "PASS" : "FAIL"}  ` +
        `n=${metrics.count} engine=${metrics.engineUsed} modern=${metrics.modern} ` +
        `franchises=${metrics.distinctFranchises} leaks=${metrics.franchiseLeaks} ` +
        `dislikeViol=${metrics.dislikeViolations}` +
        (ok ? "" : `  → ${failures.join("; ")}`)
      );
    } catch (e) {
      totalFail++;
      rows.push({ name: p.name, error: String(e), pass: false });
      console.log(`ERROR  ${String(e).slice(0, 120)}`);
    }
  }

  // Aggregate
  const ok = rows.filter((r) => r.pass);
  const agg = {
    profiles: rows.length,
    passed: ok.length,
    failed: totalFail,
    avgDistinctFranchises: avg(ok.map((r) => r.distinctFranchises)),
    totalFranchiseLeaks: sum(rows.map((r) => r.franchiseLeaks ?? 0)),
    engineMix: tally(rows.map((r) => r.engineUsed).filter(Boolean)),
  };

  console.log("\n──────────────── SUMMARY ────────────────");
  console.log(`Passed: ${agg.passed}/${agg.profiles}   Failed: ${agg.failed}`);
  console.log(`Avg distinct franchises / 10 picks: ${agg.avgDistinctFranchises.toFixed(1)}`);
  console.log(`Total franchise leaks (heuristic): ${agg.totalFranchiseLeaks}`);
  console.log(`Engine mix: ${JSON.stringify(agg.engineMix)}`);

  // Diff against baseline
  if (fs.existsSync(BASELINE_PATH)) {
    const base = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).agg;
    console.log("\n──────────────── vs BASELINE ────────────────");
    diffLine("passed", base.passed, agg.passed, true);
    diffLine("totalFranchiseLeaks", base.totalFranchiseLeaks, agg.totalFranchiseLeaks, false);
    diffLine("avgDistinctFranchises", base.avgDistinctFranchises, agg.avgDistinctFranchises, true);
  } else {
    console.log("\n(no baseline yet — run with --save-baseline to set one)");
  }

  const out = { ranAt: new Date().toISOString(), baseUrl: BASE_URL, agg, rows };
  fs.writeFileSync(path.join(__dirname, "eval-results.json"), JSON.stringify(out, null, 2));
  if (SAVE_BASELINE) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2));
    console.log(`\nSaved baseline → scripts/eval-baseline.json`);
  }
  console.log(`Full results → scripts/eval-results.json\n`);

  process.exit(totalFail > 0 ? 1 : 0);
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const avg = (xs) => (xs.length ? sum(xs) / xs.length : 0);
const tally = (xs) => xs.reduce((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
function diffLine(label, before, after, higherIsBetter) {
  const d = after - before;
  const arrow = d === 0 ? "=" : d > 0 ? "▲" : "▼";
  const good = d === 0 ? "" : (d > 0) === higherIsBetter ? " ✅" : " ⚠️";
  console.log(`  ${label}: ${Number(before).toFixed(2)} → ${Number(after).toFixed(2)} ${arrow}${good}`);
}

main().catch((e) => {
  console.error("\nEval failed to run:", String(e));
  console.error("Is the dev server up? Start it with `npm run dev`.");
  process.exit(1);
});
