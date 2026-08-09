# Animer ML pipeline

Offline scripts and notebooks that build the embeddings powering the recommender.

## Two pipelines

The Next.js app queries vectors stored in Supabase. There are two flavors:

| Pipeline | What it captures | Status |
|---|---|---|
| **Synopsis embeddings** (Phase 1) | What an anime is *about* — built from synopsis + tags + genres via BGE-base | Live |
| **CF embeddings** (Phase 3) | What an anime *feels like to watch* — learned from how millions of users rate things together (ALS on Kaggle MAL data) | Optional, recommended |

You need Phase 1 at minimum. Phase 3 is the bigger quality win, since synopsis text alone can't tell that Toradora and "Spirit Chronicles" are nothing alike to viewers despite sharing romance/school words.

## Prerequisites

1. **Create a Supabase project** at https://supabase.com (free tier is fine)
2. Go to **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_KEY` (server-only, never ship to clients)
3. (Optional) Kaggle account — only needed for Phase 3. Get an API token at https://www.kaggle.com/settings/account → "Create New Token" → downloads `kaggle.json`

---

## Phase 1 — synopsis embeddings (required)

### 1. Schema

In Supabase **SQL Editor → New query**, paste [`schema.sql`](schema.sql) → Run. This creates the `anime` table, enables pgvector, and installs the synopsis-search RPC.

> **Fresh-install note:** the current web client calls an RPC named `match_anime` with a query-vector signature, while `schema.sql` currently defines `match_anime_for_user` with seed arrays. Align the SQL function with the call in `src/lib/supabase.ts` before relying on a fresh deployment. Existing hosted databases may already contain the expected `match_anime` RPC.

### 2. Build the index

**Easiest path — Colab GPU (~10-15 min):**

Open [`colab_build_index.ipynb`](colab_build_index.ipynb) in Google Colab → Runtime → Change runtime type → T4 GPU → paste your Supabase credentials in cell 2 → Run all.

The notebook:
1. Fetches every anime from AniList GraphQL (~14k entries, paginated by year for stability)
2. Embeds title + genres + tags + synopsis using BGE-base (768-dim)
3. Upserts each row to Supabase

**Local path:**

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...

python scripts/fetch_anime.py            # → ml/data/anime.jsonl
python scripts/embed_anime.py --provider local   # free, ~30 min CPU
# or --provider openai if you have OPENAI_API_KEY (~$0.50, requires schema vector(1536))
```

### Refreshing later

`fetch_anime.py` is incremental. Re-run both scripts whenever you want to top up the index with new anime.

---

## Phase 3 — collaborative-filtering embeddings (optional, recommended)

### 1. Schema additions

In Supabase **SQL Editor**, paste [`schema_cf.sql`](schema_cf.sql) → Run. Adds a `cf_embedding vector(64)` column and a `match_anime_cf` RPC.

### 2. Train + upload

Open [`colab_train_cf.ipynb`](colab_train_cf.ipynb) in Colab → paste Supabase creds → Run all. Takes ~10-20 min.

The notebook:
1. Downloads the [Anime Recommendations Database](https://www.kaggle.com/datasets/CooperUnion/anime-recommendations-database) (~7M ratings from 73k users on 12k anime)
2. Filters out low-activity users and cold anime
3. Trains ALS (Alternating Least Squares) via `implicit` — 64 factors, 20 iterations
4. Prints Toradora's nearest-neighbors as a sanity check (you should see other emotional dramas, not random isekai)
5. Matches CF anime IDs to your Supabase `mal_id` column
6. Uploads `cf_embedding` for each match

When done, run the sanity-check query in `schema_cf.sql` to confirm `cf_embedding` is populated. The raw dataset contains roughly 12k anime; after filtering and MAL-ID matching, the deployed index can be smaller (the current application comments describe roughly 7.7k covered titles).

### Why ALS over a custom neural network?

ALS is well-understood, fast (no GPU strictly needed), and produces high-quality item embeddings for implicit-feedback datasets. A two-tower neural net would be the next-step upgrade but adds significant infra complexity for marginal quality gains at this scale.

---

## Runtime use

The main recommendation route runs both pipelines in parallel. `src/lib/supabase.ts` selects `match_anime_cf` for 64-dimensional CF vectors and `match_anime` for 768-dimensional synopsis vectors; `src/app/api/recommend/v2/route.ts` fuses both ranked lists with Reciprocal Rank Fusion. If CF has no overlap for the supplied seeds, synopsis retrieval can still carry the request.

## File reference

```
ml/
  schema.sql                  # base table + current match_anime_for_user RPC
  schema_cf.sql               # cf_embedding column + match_anime_cf RPC
  schema_feedback.sql         # recommendation reaction table
  colab_build_index.ipynb     # Phase 1: fetch + embed synopses
  colab_train_cf.ipynb        # Phase 3: train + upload CF embeddings
  colab_train_two_tower.ipynb # experimental neural CF alternative
  requirements.txt            # local-machine deps for the scripts/
  scripts/
    fetch_anime.py            # AniList → anime.jsonl
    embed_anime.py            # anime.jsonl → Supabase
  data/                       # local intermediate files (gitignored)
```
