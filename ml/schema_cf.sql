-- Phase 3 — collaborative-filtering embeddings.
-- Run AFTER the original schema.sql is set up and synopsis embeddings are uploaded.

-- 1) Add a column for CF embeddings (64-dim from SVD).
--    Kept separate from `embedding` (synopsis 768) so we can A/B compare them
--    or blend later.
alter table anime
  add column if not exists cf_embedding vector(64);

-- 2) Optional ivfflat index for fast cosine search on the CF column.
--    Build only AFTER you've populated the column (needs ≥ ~lists rows to train).
-- create index if not exists anime_cf_embedding_idx
--   on anime using ivfflat (cf_embedding vector_cosine_ops)
--   with (lists = 50);


-- 3) New version of match_anime that takes a 64-dim query vector
--    and searches against cf_embedding instead of embedding.
--    Keeps the same filtering rules (format, sequels, recaps).

drop function if exists match_anime_cf(vector, integer[], text[], integer);

create or replace function match_anime_cf(
  query_vec       vector(64),
  exclude_mal_ids integer[] default '{}',
  allowed_formats text[]    default ARRAY['TV', 'MOVIE'],
  match_count     integer   default 10
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
language sql stable
as $$
  with combined as (
    select
      a.*,
      coalesce(a.title_english, '') || ' ' || a.title as combined_title
    from anime a
    where a.cf_embedding is not null
      and a.format = any(allowed_formats)
      and (a.mal_id is null or not (a.mal_id = any(exclude_mal_ids)))
      and not (
        a.title ilike '%recap%' or a.title ilike '%summary%'
        or a.title ilike '%pilot%' or a.title ilike '%special%'
      )
  )
  select
    id, mal_id, title, title_english, synopsis,
    cover_url, year, avg_score, genres,
    (1 - (cf_embedding <=> query_vec))::real as similarity
  from combined
  where
    not (
      combined_title ~* '\m(season|part)\s*[2-9]\M'
      or combined_title ~* '\m[2-9](nd|rd|th)\s+season\M'
      or combined_title ~* '\s(ii|iii|iv|v|vi|vii|viii|ix|x)$'
      or combined_title ~* '\s(ii|iii|iv|v|vi|vii|viii|ix|x)\s'
      or combined_title ilike '%shippuden%'
      or combined_title ilike '%continuation%'
    )
  order by cf_embedding <=> query_vec
  limit match_count;
$$;

notify pgrst, 'reload schema';

-- Sanity check: count how many anime have CF embeddings (will be 0 until you upload).
-- select count(*) filter (where cf_embedding is not null) as with_cf,
--        count(*) filter (where embedding is not null) as with_synopsis
-- from anime;
