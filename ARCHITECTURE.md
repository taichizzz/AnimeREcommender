# Architecture

Animer is a Next.js application with a browser UI, server-side route handlers, an offline ML pipeline, and three external data systems: Supabase, Groq, and anime metadata APIs.

## System map

```text
Browser
  ├─ landing and manual search ───────────────► Jikan (through /api/search)
  ├─ MAL login and dashboard ────────────────► MyAnimeList OAuth/API
  ├─ quiz + manual seeds ─┐
  └─ quiz + MAL history ──┴─► recommendation route
                                  │
                         ┌────────┴────────┐
                         │                 │
                    CF vectors      synopsis vectors
                         │                 │
                         └──── Supabase ───┘
                                  │
                       rank fusion + hard filters
                                  │
                    Groq selection + reason writing
                                  │
                           ranked top results

Offline ML notebooks/scripts ──► AniList/Kaggle ──► Supabase pgvector
```

## Runtime layers

### Frontend

The App Router exposes three main experiences:

- `/` is the product landing page.
- `/recommend` supports manual title search and MAL-list recommendation modes, runs the onboarding quiz, renders results, and sends optimistic feedback.
- `/dashboard` fetches the MAL profile and completed list, then renders status, score, genre, and taste-comparison charts with Recharts.

`src/components/RecommendQuiz.tsx` owns the four-step preference flow. Client components call only internal `/api/*` routes; service credentials never enter the browser bundle.

### Route handlers

`src/app/api` is the application boundary for browser requests:

- `recommend/v2` orchestrates hybrid retrieval, filtering, reranking, and response formatting.
- `recommend/fromlist` translates a MAL account into a v2 request.
- `auth/*` implements OAuth with `plain` PKCE and HTTP-only cookies.
- `mal/animelist`, `search`, and `feedback` proxy or persist user-facing data.
- `recommend` and `recommend/anilist` are legacy experiments.

See [API_REFERENCE.md](API_REFERENCE.md) for payloads and error behavior.

### Service libraries

- `src/lib/supabase.ts` creates the server-only Supabase client, builds weighted user vectors, and calls pgvector RPCs.
- `src/lib/groq.ts` owns the two-stage prompt pipeline and JSON parsing.
- `src/lib/jikan.ts` and `src/lib/anilist.ts` are small external API clients with retry/error handling.

## Recommendation pipeline

### 1. Taste input

Manual mode sends up to ten chosen MAL IDs. MAL mode loads all rated completed titles and uses their 1–10 scores as signals; completed and watching titles are excluded from results. Optional quiz fields add a favorite, what hooked the user, current moods, dislikes, and free text.

### 2. Weighted user vectors

For each retriever, Supabase returns the relevant seed embeddings. The server computes a weighted vector using:

```text
weight = user score - 6.5
user vector = sum(seed embedding × weight)
```

High ratings pull results closer; low ratings push the vector away. Manual requests without valid aligned scores default every seed to `9`.

### 3. Parallel retrieval

Both retrievers run with `Promise.allSettled`, so one can succeed if the other is unavailable:

| Retriever | Vector | Source | Strength | Limitation |
| --- | --- | --- | --- | --- |
| Collaborative filtering | 64 dimensions | ALS item factors from MAL rating behavior | Captures co-preference and viewing feel | Historical dataset has limited coverage of newer titles. |
| Synopsis | 768 dimensions | BGE-base over title, genres, tags, and synopsis | Covers the broad AniList catalog and new titles | Textual similarity can miss tone and viewing experience. |

Each retriever asks Supabase for 50 TV/movie candidates, excluding seeds and caller-provided MAL IDs. Database RPCs also remove obvious recaps, specials, and numbered continuations.

### 4. Reciprocal Rank Fusion

Raw cosine similarities from unrelated vector spaces are not comparable. Reciprocal Rank Fusion (RRF) merges their positions instead:

```text
RRF score(item) = Σ 1 / (60 + rank + 1)
```

An item found by both engines receives two contributions; an item available to only one engine can still appear. The response reports `hybrid`, `cf`, or `synopsis` according to the successful non-empty result lists.

### 5. Deterministic filters

Before any LLM call, route code:

1. removes candidates whose normalized leading title resembles a seed franchise;
2. maps supported dislike chips to AniList genres and excludes matches;
3. keeps the first 30 candidates for reranking.

The title heuristic intentionally favors recall over perfect franchise taxonomy. It can miss renamed spin-offs or reject unrelated titles with the same distinctive first word.

### 6. Two-stage Groq pipeline

If `GROQ_API_KEY` is configured:

1. `openai/gpt-oss-120b` selects and orders up to ten candidates, produces internal rationales, and summarizes its taste interpretation.
2. `llama-3.3-70b-versatile` turns those rationales plus richer synopsis/tag data into specific 20–35 word reasons.

If stage two fails, its item rationale becomes the reason. If the overall LLM operation fails, the endpoint retains embedding order and produces a similarity-based fallback. This keeps retrieval useful during model errors or development without Groq.

## Data model

The `anime` table is keyed by AniList ID and stores MAL cross-references, display metadata, JSON tags, a 768-dimensional synopsis vector, and an optional 64-dimensional CF vector. The `feedback` table maintains one reaction per `(user_key, anime_mal_id)` plus optional seed and engine context.

The Supabase service-role key is intentionally server-only. There is no direct browser-to-Supabase data path.

Schema and data-building details live in [ml/README.md](ml/README.md).

## Authentication and session lifecycle

1. `/api/auth/login` generates a PKCE verifier and CSRF state and stores them in short-lived HTTP-only cookies.
2. MAL redirects to `/api/auth/callback`, which verifies state and exchanges the code.
3. The callback stores access and refresh tokens in HTTP-only, `SameSite=Lax` cookies. Cookies become `Secure` in production.
4. Authenticated routes read the access-token cookie and call MAL server-side.
5. Logout deletes both token cookies.

Refresh tokens are stored but are not currently used to renew expired access tokens. Re-authentication is required after expiry.

## Offline ML pipeline

Runtime requests never train models. The `ml/` workflows populate Supabase ahead of time:

- `colab_build_index.ipynb` fetches AniList metadata, creates BGE-base embeddings, and upserts the catalog.
- `colab_train_cf.ipynb` downloads the MAL ratings dataset, trains 64-factor ALS, maps items through MAL IDs, and uploads CF vectors.
- `colab_train_two_tower.ipynb` is an experimental neural alternative.
- `ml/scripts/` provides a local synopsis-index path.

## Reliability and operational boundaries

- Retrieval engines fail independently, and Groq failure degrades to deterministic ordering.
- Jikan and AniList failures surface to their calling routes; the shared clients do not currently retry transient rate limits. MAL list fetches also do not refresh expired credentials.
- `/api/health` verifies only the Next.js process, not dependencies.
- LLM prompts and responses are currently logged server-side. Treat logs as potentially containing user preference text.
- The service-role key bypasses normal Supabase row-level restrictions and must never be exposed or committed.

## Evaluation

`scripts/eval.mjs` sends 12 fixed profiles to a live `/api/recommend/v2`, checks result count, dislike violations, modern-title coverage, and franchise leakage, and compares aggregate metrics with `scripts/eval-baseline.json`. It is an integration-quality harness, not a unit-test suite, and requires configured external services.

## Key extension points

- Add structured dislike mappings in `src/app/api/recommend/v2/route.ts` and mirror them in `scripts/eval.mjs`.
- Change retrieval math or vector RPC use in `src/lib/supabase.ts`.
- Change selection/writing behavior and model IDs in `src/lib/groq.ts`.
- Add or retrain embeddings through `ml/`; do not generate them during web requests.
