# Animer ML pipeline

Offline scripts that build the semantic-similarity index used by the recommender.

## One-time setup

1. **Create a Supabase project** at https://supabase.com (free tier is fine)
2. Open **Database → SQL Editor → New query**, paste the contents of [`schema.sql`](schema.sql), and run it
3. Grab two values from **Settings → API**:
   - `Project URL` → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_KEY` (server-only, never ship to client)
4. (If using OpenAI embeddings) get an API key from https://platform.openai.com → `OPENAI_API_KEY`

## Build the index

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Step 1: pull every anime from AniList → ml/data/anime.jsonl
python scripts/fetch_anime.py

# Step 2: embed and upload to Supabase
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_KEY=eyJ...
export OPENAI_API_KEY=sk-...
python scripts/embed_anime.py --provider openai
```

Total cost: roughly $0.50 with OpenAI's `text-embedding-3-small`. Free if you
swap to `--provider local` (uses BGE-base, runs on your CPU in ~30 min).

## Refresh later

`fetch_anime.py` is incremental — it skips IDs already in `anime.jsonl`. So:

```bash
python scripts/fetch_anime.py    # picks up new anime
python scripts/embed_anime.py    # upserts new rows into Supabase
```
