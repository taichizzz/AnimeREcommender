-- Run this in your Supabase SQL editor (Database → SQL Editor → New query)
-- It enables pgvector and creates the anime embeddings table.

create extension if not exists vector;

create table if not exists anime (
  id            integer primary key,        -- AniList ID
  mal_id        integer unique,             -- MAL ID for cross-reference
  title         text not null,
  title_english text,
  synopsis      text,
  cover_url     text,
  year          integer,
  avg_score     integer,                    -- 0-100
  popularity    integer,
  genres        text[] default '{}',
  tags          jsonb default '[]'::jsonb,  -- [{name, rank}]
  format        text,                       -- TV, MOVIE, OVA, etc.
  episodes      integer,

  -- 768-dim for BGE-base (the default in colab_build_index.ipynb).
  -- Switch to 1536 if you embed with OpenAI text-embedding-3-small.
  embedding     vector(768),

  updated_at    timestamptz default now()
);

create index if not exists anime_mal_id_idx on anime (mal_id);

-- IVFFlat index for approximate nearest-neighbor search.
-- Build it AFTER inserting data (needs ≥ ~lists rows to train).
-- create index anime_embedding_idx
--   on anime using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);


-- ─── Helper RPC: weighted average of seed embeddings → top N matches ────────
-- Call this from Next.js. Pass the user's liked anime MAL IDs + scores.
-- Returns: top N anime not in the exclusion list, ranked by cosine similarity.

create or replace function match_anime_for_user(
  liked_mal_ids   integer[],
  liked_scores    integer[],     -- same length as liked_mal_ids; raw 1-10 scale
  exclude_mal_ids integer[] default '{}',
  match_count     integer        default 10
)
returns table (
  id            integer,
  mal_id        integer,
  title         text,
  title_english text,
  synopsis      text,
  cover_url     text,
  year          integer,
  avg_score     integer,
  genres        text[],
  similarity    real
)
language plpgsql stable
as $$
declare
  user_vec vector(768);
begin
  -- Build user vector: weighted sum of liked anime embeddings.
  -- Centered weights: score 7 = 0, score 10 = +3, score 4 = -3.
  -- Negative weights mean disliked anime push results AWAY from them.
  select
    sum(
      a.embedding * (s::real - 6.5)
    )
  into user_vec
  from anime a
  join unnest(liked_mal_ids, liked_scores) with ordinality as t(mid, s, ord)
    on a.mal_id = t.mid
  where a.embedding is not null;

  if user_vec is null then
    return;
  end if;

  return query
  select
    a.id,
    a.mal_id,
    a.title,
    a.title_english,
    a.synopsis,
    a.cover_url,
    a.year,
    a.avg_score,
    a.genres,
    (1 - (a.embedding <=> user_vec))::real as similarity
  from anime a
  where a.embedding is not null
    and (a.mal_id is null or not (a.mal_id = any(exclude_mal_ids)))
  order by a.embedding <=> user_vec
  limit match_count;
end;
$$;
