-- Culé XI — trivia across all of La Liga: every La Liga club and player (one-time import),
-- awards, fast fuzzy search, and a single query that builds Tiki-Taka-Toe category sets.

create extension if not exists pg_trgm with schema extensions;

-- People: fame (Wikipedia sitelinks, for ranking search and examples), La Liga facts.
alter table public.trivia_players
  add column fame       integer,
  add column liga       boolean not null default false,  -- played for a La Liga club
  add column liga_apps  integer,
  add column liga_goals integer,
  add column pichichis  smallint not null default 0,      -- La Liga top-scorer trophies
  add column zamoras    smallint not null default 0;      -- La Liga best-goalkeeper trophies

-- Clubs: short names fans use, and whether (and how high) they rank in La Liga history.
alter table public.trivia_clubs
  add column short_name text,
  add column liga       boolean not null default false,
  add column liga_rank  smallint;

-- Autocomplete over ~15k people: trigram index for `ilike '%q%'`, fame for ordering.
create index trivia_players_search_trgm_idx
  on public.trivia_players using gin (search_text extensions.gin_trgm_ops);
create index trivia_players_fame_idx on public.trivia_players (fame desc nulls last);

-- One round trip for the daily grid: every candidate category with its members, most famous
-- first. Server-only (service role).
create or replace function public.ttt_category_members(club_qids text[])
returns table (kind text, key text, ids bigint[])
language sql
stable
security definer
set search_path = public
as $$
  with people as (
    select * from public.trivia_players where 'player' = any (roles)
  )
  select 'club', pc.club_qid, array_agg(p.id order by p.fame desc nulls last, p.id)
    from public.trivia_player_clubs pc join people p on p.id = pc.player_id
   where pc.club_qid = any (club_qids)
   group by pc.club_qid
  union all
  -- Spain is left out: most players are Spanish, so its squares would be trivial.
  select 'nation', p.country_code, array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p
   where p.country_code is not null and p.country_code <> 'ES'
   group by p.country_code
  union all
  select 'position', p.position, array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p
   where p.position in ('GK', 'DEF', 'MID', 'FWD')
   group by p.position
  union all
  select 'award', 'pichichi', array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p where p.pichichis > 0
  union all
  select 'award', 'zamora', array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p where p.zamoras > 0
  union all
  select 'award', 'liga100', array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p where p.liga_goals >= 100
  union all
  select 'decade', d::text, array_agg(p.id order by p.fame desc nulls last, p.id)
    from generate_series(1950, 2020, 10) d
    join people p
      on p.barca_from is not null
     and p.barca_from <= d + 9
     and coalesce(p.barca_to, extract(year from now())::int) >= d
   group by d;
$$;

revoke execute on function public.ttt_category_members(text[]) from public, anon, authenticated;
grant execute on function public.ttt_category_members(text[]) to service_role;
