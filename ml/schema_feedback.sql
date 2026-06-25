-- Feedback loop — store users' reactions to recommendations.
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL → New query → paste → Run).
--
-- This is the start of your own ratings dataset: every up/down is a real
-- user→anime signal you can later use to retrain CF (and to power the eval).

create table if not exists feedback (
  id            bigint generated always as identity primary key,
  user_key      text   not null,                  -- 'anon:<uuid>' (per browser) or 'mal:<id>' later
  anime_mal_id  bigint not null,                  -- which anime the reaction is about
  signal        text   not null
                  check (signal in ('up', 'down', 'not_interested')),
  seed_mal_ids  bigint[],                          -- the seeds that produced this rec (optional context)
  engine_used   text,                              -- 'hybrid' | 'synopsis' | 'cf' (optional context)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- one current reaction per user+anime, so changing your mind UPSERTs the row
  unique (user_key, anime_mal_id)
);

create index if not exists feedback_anime_idx on feedback (anime_mal_id);
create index if not exists feedback_user_idx  on feedback (user_key);

-- Let PostgREST (the REST API the app uses) pick up the new table.
notify pgrst, 'reload schema';
