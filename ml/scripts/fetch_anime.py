"""
Fetch all anime from AniList and dump to anime.jsonl.

Usage:
    python fetch_anime.py            # incremental: skips IDs already in anime.jsonl
    python fetch_anime.py --reset    # start fresh

The AniList GraphQL endpoint allows up to 50 items per page. We paginate by
popularity descending until the page comes back empty.

Output: one JSON object per line in ml/data/anime.jsonl.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

import requests

ANILIST_URL = "https://graphql.anilist.co"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
OUTPUT_FILE = DATA_DIR / "anime.jsonl"

QUERY = """
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage lastPage }
    media(type: ANIME, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english }
      description(asHtml: false)
      coverImage { large }
      startDate { year }
      averageScore
      popularity
      genres
      tags { name rank isMediaSpoiler }
      format
      episodes
    }
  }
}
"""


def fetch_page(page: int, per_page: int = 50) -> dict[str, Any]:
    res = requests.post(
        ANILIST_URL,
        json={"query": QUERY, "variables": {"page": page, "perPage": per_page}},
        timeout=30,
    )
    if res.status_code == 429:
        retry = int(res.headers.get("Retry-After", "60"))
        print(f"  rate-limited, sleeping {retry}s")
        time.sleep(retry)
        return fetch_page(page, per_page)
    res.raise_for_status()
    return res.json()["data"]["Page"]


def normalize(media: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": media["id"],
        "mal_id": media.get("idMal"),
        "title": media["title"]["romaji"],
        "title_english": media["title"].get("english"),
        "synopsis": (media.get("description") or "").replace("<br>", " ").strip() or None,
        "cover_url": (media.get("coverImage") or {}).get("large"),
        "year": (media.get("startDate") or {}).get("year"),
        "avg_score": media.get("averageScore"),
        "popularity": media.get("popularity"),
        "genres": media.get("genres") or [],
        "tags": [
            {"name": t["name"], "rank": t["rank"]}
            for t in (media.get("tags") or [])
            if not t.get("isMediaSpoiler")
        ],
        "format": media.get("format"),
        "episodes": media.get("episodes"),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--max-pages", type=int, default=400)  # ~20k anime cap
    args = parser.parse_args()

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    seen_ids: set[int] = set()
    if OUTPUT_FILE.exists() and not args.reset:
        with OUTPUT_FILE.open() as f:
            for line in f:
                seen_ids.add(json.loads(line)["id"])
        print(f"Resuming with {len(seen_ids)} existing entries")

    mode = "w" if args.reset else "a"

    with OUTPUT_FILE.open(mode) as f:
        for page in range(1, args.max_pages + 1):
            try:
                data = fetch_page(page)
            except Exception as e:
                print(f"page {page} failed: {e}")
                time.sleep(5)
                continue

            media = data["media"]
            new_count = 0
            for m in media:
                if m["id"] in seen_ids:
                    continue
                f.write(json.dumps(normalize(m), ensure_ascii=False) + "\n")
                seen_ids.add(m["id"])
                new_count += 1
            f.flush()

            print(f"page {page:>3}: +{new_count} new (total {len(seen_ids)})")

            if not data["pageInfo"]["hasNextPage"]:
                print("done — no more pages")
                break

            # be polite to AniList
            time.sleep(0.7)

    print(f"\nWrote {len(seen_ids)} anime to {OUTPUT_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
