# Animer

A personalized anime recommender that blends collaborative filtering and semantic synopsis embeddings, then runs a two-stage LLM pipeline that picks your matches and explains each one in your terms — not just what shares a genre.

Built as a learning project to explore modern recommendation systems beyond simple cosine similarity.

## How it works

```
                      ┌──────────────────────────────┐
                      │   Your seeds + quiz answers   │
                      │  (manual picks OR MAL list)   │
                      └──────────────┬───────────────┘
                                     │  (both engines run in parallel)
                ┌────────────────────┼────────────────────┐
                ▼                                          ▼
   Collaborative filtering                    Synopsis embeddings (BGE-base)
   "what an anime feels like"                 "what an anime is about"
   (~7.7k anime with rating signal)           (all ~14k anime, incl. new ones)
                │                                          │
                └────────────────────┬────────────────────┘
                                     ▼
                  Reciprocal Rank Fusion → one candidate pool
                                     │
                                     ▼
        Hard filters: seed-franchise (no "more Fate"), dislikes,
                formats, sequels, already-watched
                                     │
                                     ▼
             Stage 1 · gpt-oss-120b (reasoning model)
          selects + orders the 10, emits a rationale each
                                     │
                                     ▼
             Stage 2 · Llama 3.3 70B (writer model)
        turns each rationale + full synopsis into a personal,
                  specific one-sentence reason
                                     │
                                     ▼
                     Top 10 with personal reasons
```

## Features

- **Two entry modes**
  - **Pick your own** — search anime and select up to 10 to seed recommendations
  - **From my MAL list** — log in with MAL OAuth, the recommender uses your full rated history with low scores acting as negative signals
- **Interactive onboarding quiz** — 4 questions before recommendations
  - Which of your picks is your favorite? (infinite 3D poster wheel — drag, scroll, or tap)
  - What hooked you about it? (story / atmosphere / characters / custom)
  - What mood are you in? (multi-select chips)
  - Anything you don't want? (multi-select chips → real genre filters)
- **Hybrid retrieval** — CF and synopsis engines run in parallel and are fused with Reciprocal Rank Fusion; anime ranked highly by both rise to the top, and modern anime missing from the CF index still surface via synopsis. The response reports which engine(s) contributed (`engineUsed: hybrid | cf | synopsis`).
- **Two-stage LLM reasoning** — a reasoning model (gpt-oss-120b) does the judgment-heavy selection and emits a per-pick rationale; a writer model (Llama 3.3 70B) turns each rationale into one vivid, non-generic sentence grounded in your quiz answers. Separate models = separate rate-limit budgets.
- **Hard franchise filter** — sequels/prequels/spin-offs of your seeds are removed code-side before the LLM ever sees them.
- **Feedback loop** — Like / Dislike / Not interested on every recommendation, stored per user in Supabase (the seed of an in-house ratings dataset).
- **Eval harness** — `npm run eval` runs 12 fixed taste profiles through the live API and checks hard rules (no franchise leaks, dislikes respected, modern-taste coverage) plus tracked metrics (diversity, engine mix) against a saved baseline.
- **Dashboard** — MAL stats with status donut, score distribution, top genres, a "you vs the crowd" scatter (your score vs MAL average, jittered to stay readable), and a genre-affinity radar.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Recharts |
| Auth | MyAnimeList OAuth 2.0 (PKCE plain method — MAL doesn't support S256) |
| LLM | Groq: `openai/gpt-oss-120b` (selection) + `llama-3.3-70b-versatile` (reason writing), both free tier |
| Vector DB | Supabase Postgres + pgvector |
| Anime metadata | AniList GraphQL (14k+ anime) |
| Synopsis embeddings | BGE-base (768-dim), built offline in Colab |
| CF embeddings | 64-dim item vectors trained on the Kaggle MAL ratings dataset (~7M ratings, ~73k users) |
| Hosting | Vercel |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the embedding index

Anime embeddings live in Supabase, not in this repo. See [`ml/README.md`](ml/README.md) for the offline pipeline that builds them.

Short version: create a free Supabase project → run `ml/schema.sql`, `ml/schema_cf.sql`, and `ml/schema_feedback.sql` → run the Colab notebooks in `ml/` → ~10 minutes later you have 14k anime indexed (plus CF vectors and the feedback table).

### 3. Environment variables

Create `.env.local`:

```bash
# Supabase (required)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Groq for the two-stage LLM pipeline (required — free key at console.groq.com/keys)
GROQ_API_KEY=gsk_...

# MAL OAuth (required for "From my MAL list" mode)
# Register your app at myanimelist.net/apiconfig
MAL_CLIENT_ID=...
MAL_CLIENT_SECRET=...
```

For Vercel deployment, set these in **Project Settings → Environment Variables**. Also add your production URL to MAL OAuth's allowed redirect URIs.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Available scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — ESLint
- `npm run eval` — recommendation-quality eval (needs the dev server running; `--save-baseline` to set a new baseline)

## API routes

### `POST /api/recommend/v2`

Main recommendation endpoint. Takes seeds + optional quiz signals, returns ranked anime.

```json
{
  "likedAnimeIds": [4224, 23273, 25537],
  "likedScores": [10, 10, 9],
  "excludeMalIds": [5114, 11061],
  "favoriteMalId": 4224,
  "quiz": {
    "hookedBy": "story",
    "mood": ["Romantic", "Chill"],
    "dislikes": ["Mecha", "Sports"]
  },
  "userText": "something heartfelt tonight"
}
```

Response:

```json
{
  "results": [
    {
      "id": 12345,
      "malId": 67890,
      "title": "...",
      "imageUrl": "...",
      "score": 84,
      "year": 2015,
      "reason": "<personal one-sentence reason>"
    }
  ],
  "llmUsed": true,
  "engineUsed": "hybrid",
  "thinking": "<2-3 sentences on how the model read your taste>"
}
```

### `POST /api/recommend/fromlist`

Same as above but builds seeds from your MAL list (requires OAuth). Query param `?seeds_only=1` returns just the quiz-seed candidates without running the full pipeline.

### `POST /api/feedback`

Records a reaction to a recommendation: `{ animeMalId, signal: "up" | "down" | "not_interested" | "none", userKey }`. Upserts one row per user+anime; `"none"` clears it.

### `GET /api/auth/{login,callback,logout,me}`

MAL OAuth flow + session check.

### `GET /api/mal/animelist`

Returns your full MAL list (all statuses, paginated server-side).

### `GET /api/search?q=...`

Title search — used by manual mode's picker (powered by Jikan).

## Project structure

```
src/
  app/
    page.tsx                          # Landing
    recommend/page.tsx                # Picks → quiz → results flow
    dashboard/page.tsx                # MAL stats charts
    api/
      auth/{login,callback,logout,me}/
      mal/animelist/                  # Paginated MAL list fetch
      feedback/                       # Like/Dislike/Not-interested storage
      recommend/
        v2/                           # Hybrid retrieval + two-stage LLM pipeline
        fromlist/                     # MAL list → v2
        anilist/                      # Older AniList-based pipeline (legacy)
        route.ts                      # Original Jikan pipeline (legacy)
      search/                         # Jikan title search
  components/
    RecommendQuiz.tsx                 # 4-step wizard + favorite wheel
  lib/
    supabase.ts                       # pgvector queries + weighted user-vector math
    groq.ts                           # Two-stage LLM pipeline (select → write)
    anilist.ts                        # AniList GraphQL client
    jikan.ts                          # Jikan client (legacy)

scripts/
  eval.mjs                            # Recommendation-quality eval harness

ml/
  schema.sql                          # Supabase table + match_anime RPC
  schema_cf.sql                       # CF column + match_anime_cf RPC
  schema_feedback.sql                 # Feedback table (run once in Supabase)
  colab_build_index.ipynb             # Synopsis embeddings
  colab_train_cf.ipynb                # Collaborative filtering (ALS)
  colab_train_two_tower.ipynb         # Neural two-tower CF (BPR)
  scripts/                            # Local-machine versions of the above
```

## Roadmap

- ✅ Synopsis embeddings + pgvector retrieval
- ✅ LLM re-rank with quiz signals
- ✅ MAL OAuth + dashboard
- ✅ Collaborative-filtering embeddings
- ✅ Hybrid retrieval (CF + synopsis fused with RRF)
- ✅ Two-stage LLM (reasoning model selects, writer model explains)
- ✅ Franchise filter, feedback loop, eval harness
- 🔜 Content→CF cold-start tower (generate CF-quality vectors for brand-new anime from their content)
- 🔜 Retrain CF on a newer ratings dump (current one ends ~2018)
- 🔜 Retrain on our own collected feedback once there's enough signal

## Notes / honest limitations

- **The CF index ends around 2018** — it's trained on a ratings dump from that era, so newer anime have no collaborative signal and are carried by the synopsis engine (that's what the hybrid fusion is for). The cold-start tower on the roadmap is the real fix.
- Synopsis embeddings cluster on textual similarity, not viewing experience. Two anime with similar synopses can feel completely different to watch.
- The franchise filter is a title heuristic (shared distinctive leading words). It catches the Fate/FMA-style leaks the eval measures, but an obscurely-renamed spin-off can slip through, and a rare false positive is possible.
- The AniList index is ~14k anime — covers virtually anything you've heard of, but obscure ONAs / Chinese co-productions may be missing.
- MAL OAuth uses the `plain` PKCE method, not `S256`, because MAL doesn't support S256 (yes, really).
