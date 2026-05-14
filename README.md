# Animer

A personalized anime recommender that combines semantic synopsis embeddings, collaborative filtering, and an LLM re-ranker to suggest anime based on what you actually love — not just what shares a genre.

Built as a learning project to explore modern recommendation systems beyond simple cosine similarity.

## How it works

```
                      ┌──────────────────────────────┐
                      │   Your seeds + quiz answers   │
                      │  (manual picks OR MAL list)   │
                      └──────────────┬───────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                                          ▼
   Synopsis embeddings (BGE-base)             Collaborative-filtering
   "what an anime is about"                   embeddings (ALS, Phase 3)
                │                                          │
                └────────────────────┬────────────────────┘
                                     ▼
                       Supabase pgvector → top 30 candidates
                                     │
                                     ▼
                  Filter: format, sequels, dislikes, watched
                                     │
                                     ▼
                     Groq Llama 3.3 70B re-ranker
              (uses your seeds + quiz signals + tags)
                                     │
                                     ▼
                          Top 10 with personal reasons
```

## Features

- **Two entry modes**
  - **Pick Your Own** — search anime and select up to 10 to seed recommendations
  - **From My MAL List** — log in with MAL OAuth, the recommender uses your full rated history with low scores acting as negative signals
- **Interactive onboarding quiz** — 4 questions before recommendations
  - Which of your picks is your favorite?
  - What hooked you about it? (story / atmosphere / characters / custom)
  - What mood are you in? (multi-select chips)
  - Anything you don't want? (multi-select chips → real SQL filters)
- **Smart filtering** — auto-excludes sequels, OVAs, recaps, already-watched anime, and genres you flagged as dislikes
- **LLM-generated reasons** — Groq writes a personal sentence per recommendation grounded in your specific answers
- **"How the AI thought about your taste"** — collapsible panel showing Groq's overall reasoning
- **Dashboard** — your MAL stats with donut chart of statuses, score distribution, top genres, and a paginated grid of all rated anime

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Recharts |
| Auth | MyAnimeList OAuth 2.0 (PKCE plain method — MAL doesn't support S256) |
| LLM | Groq Llama 3.3 70B (free tier, ~6000 req/day) |
| Vector DB | Supabase Postgres + pgvector |
| Anime metadata | AniList GraphQL (14k+ anime) |
| Synopsis embeddings | BGE-base (768-dim) trained offline in Colab |
| CF embeddings | ALS via `implicit` library, trained on Kaggle MAL dataset (Phase 3) |
| Hosting | Vercel |

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the embedding index

Anime embeddings live in Supabase, not in this repo. See [`ml/README.md`](ml/README.md) for the offline pipeline that builds them.

Short version: create a free Supabase project → run `ml/schema.sql` → run the Colab notebook in `ml/colab_build_index.ipynb` → ~10 minutes later you have 14k anime indexed.

### 3. Environment variables

Create `.env.local`:

```bash
# Supabase (required)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...

# Groq for LLM re-ranking (required — get free key at console.groq.com/keys)
GROQ_API_KEY=gsk_...

# MAL OAuth (required for "From My MAL List" mode)
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
      "reason": "<personal one-sentence reason from Groq>"
    }
  ],
  "llmUsed": true,
  "thinking": "<2-3 sentences explaining the LLM's overall approach>"
}
```

### `POST /api/recommend/fromlist`

Same as above but builds seeds from your MAL list (requires OAuth). Query param `?seeds_only=1` returns just the quiz-seed candidates without running the full pipeline.

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
    page.tsx                          # Home (modes + quiz + results)
    dashboard/page.tsx                # MAL stats charts
    api/
      auth/{login,callback,logout,me}/
      mal/animelist/                  # Paginated MAL list fetch
      recommend/
        v2/                           # Main pgvector + Groq pipeline
        fromlist/                     # MAL list → v2
        anilist/                      # Older AniList-based pipeline (kept for comparison)
        route.ts                      # Original Jikan pipeline (legacy)
      search/                         # Jikan title search
  components/
    RecommendQuiz.tsx                 # 4-step wizard
  lib/
    supabase.ts                       # pgvector queries + weighted user-vector math
    groq.ts                           # LLM re-ranker + prompt
    anilist.ts                        # AniList GraphQL client
    jikan.ts                          # Jikan client (legacy)

ml/
  schema.sql                          # Supabase table + match_anime RPC
  schema_cf.sql                       # CF column + match_anime_cf RPC (Phase 3)
  colab_build_index.ipynb             # Synopsis embeddings
  colab_train_cf.ipynb                # Collaborative filtering (Phase 3)
  scripts/                            # Local-machine versions of the above
```

## Roadmap

- ✅ Synopsis embeddings + pgvector retrieval
- ✅ Groq LLM re-rank with quiz signals
- ✅ MAL OAuth + dashboard
- 🚧 Collaborative-filtering embeddings (Phase 3 — in progress)
- 🔜 Hybrid scoring (blend synopsis + CF) once both are live
- 🔜 Online learning from user click feedback

## Notes / honest limitations

- Synopsis embeddings cluster on textual similarity, not viewing experience. Two anime with similar synopses can feel completely different to watch. Phase 3 (CF) addresses this.
- Groq's Llama 3.3 70B is good but not great at strict instruction-following; reasons sometimes still drift toward templated phrasing. A model swap to GitHub Models (free Claude/GPT-5) would help if needed.
- The AniList index is ~14k anime — covers virtually anything you've heard of, but obscure ONAs / Chinese-coproductions may be missing.
- MAL OAuth uses the `plain` PKCE method, not `S256`, because MAL doesn't support S256 (yes, really).
