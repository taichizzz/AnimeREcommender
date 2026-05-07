"""
Generate embeddings for every anime in anime.jsonl and upload to Supabase.

Two modes:

  1. OpenAI (default — cheap, ~$0.50 for ~17k anime, dim=1536)
       export OPENAI_API_KEY=sk-...
       python embed_anime.py --provider openai

  2. Local (free, runs on your laptop CPU/GPU, dim=768 for BGE-base)
       pip install sentence-transformers
       python embed_anime.py --provider local

If you switch providers, you must update the `vector(N)` dimension in schema.sql
and re-run the schema (or alter the column).

Required env vars:
    SUPABASE_URL        e.g. https://xxxxx.supabase.co
    SUPABASE_SERVICE_KEY (Settings → API → service_role secret)
    OPENAI_API_KEY      (only for --provider openai)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Iterable

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "anime.jsonl"
BATCH = 100  # how many anime per embedding API call


def text_for_embedding(a: dict) -> str:
    """Concatenate the fields most useful for semantic similarity."""
    parts = [a.get("title") or ""]
    if a.get("title_english") and a["title_english"] != a["title"]:
        parts.append(a["title_english"])
    if a.get("genres"):
        parts.append("Genres: " + ", ".join(a["genres"]))
    top_tags = [t["name"] for t in (a.get("tags") or []) if t["rank"] >= 60][:8]
    if top_tags:
        parts.append("Themes: " + ", ".join(top_tags))
    if a.get("synopsis"):
        parts.append(a["synopsis"][:1500])
    return "\n".join(parts)


# ── Providers ────────────────────────────────────────────────────────────────

def embed_openai(texts: list[str]) -> list[list[float]]:
    from openai import OpenAI
    client = OpenAI()  # reads OPENAI_API_KEY
    res = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    return [d.embedding for d in res.data]


_local_model = None
def embed_local(texts: list[str]) -> list[list[float]]:
    global _local_model
    if _local_model is None:
        from sentence_transformers import SentenceTransformer
        # 768-dim, ~430MB, GPU optional
        _local_model = SentenceTransformer("BAAI/bge-base-en-v1.5")
    embs = _local_model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return embs.tolist()


# ── Supabase upsert ─────────────────────────────────────────────────────────

def upsert_to_supabase(rows: list[dict]) -> None:
    from supabase import create_client
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    sb = create_client(url, key)
    # `upsert` on primary key (id) — re-running the script just refreshes rows.
    sb.table("anime").upsert(rows, on_conflict="id").execute()


# ── Main ─────────────────────────────────────────────────────────────────────

def chunked(it: Iterable, n: int):
    buf = []
    for x in it:
        buf.append(x)
        if len(buf) >= n:
            yield buf
            buf = []
    if buf:
        yield buf


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--provider", choices=["openai", "local"], default="openai")
    parser.add_argument("--limit", type=int, default=None,
                        help="Embed only the first N entries (for testing)")
    args = parser.parse_args()

    if not DATA_FILE.exists():
        print(f"Missing {DATA_FILE}. Run fetch_anime.py first.")
        return 1

    embed_fn = embed_openai if args.provider == "openai" else embed_local

    with DATA_FILE.open() as f:
        anime_list = [json.loads(line) for line in f]

    if args.limit:
        anime_list = anime_list[: args.limit]

    print(f"Embedding {len(anime_list)} anime via {args.provider}...")

    total = 0
    t0 = time.time()
    for batch in chunked(anime_list, BATCH):
        texts = [text_for_embedding(a) for a in batch]
        try:
            vectors = embed_fn(texts)
        except Exception as e:
            print(f"  batch failed: {e} — sleeping 10s and retrying")
            time.sleep(10)
            vectors = embed_fn(texts)

        rows = []
        for a, v in zip(batch, vectors):
            rows.append({
                "id": a["id"],
                "mal_id": a.get("mal_id"),
                "title": a["title"],
                "title_english": a.get("title_english"),
                "synopsis": a.get("synopsis"),
                "cover_url": a.get("cover_url"),
                "year": a.get("year"),
                "avg_score": a.get("avg_score"),
                "popularity": a.get("popularity"),
                "genres": a.get("genres") or [],
                "tags": a.get("tags") or [],
                "format": a.get("format"),
                "episodes": a.get("episodes"),
                "embedding": v,
            })

        upsert_to_supabase(rows)
        total += len(rows)
        elapsed = time.time() - t0
        rate = total / elapsed if elapsed else 0
        print(f"  uploaded {total}/{len(anime_list)}  ({rate:.1f}/s)")

    print(f"\nDone in {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
