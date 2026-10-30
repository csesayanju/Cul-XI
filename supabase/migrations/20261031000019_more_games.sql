-- Culé XI — more data and three more games:
--  * Ballon d'Or wins and podiums (Wikipedia), a new Tiki-Taka-Toe trophy square;
--  * Missing XI: starting line-ups of European finals with Spanish clubs (Wikipedia);
--  * Connections: 16 players, 4 hidden groups (built from the stored category sets);
--  * Odd One Out: which of four never played for the club? (endless, server-judged).

alter table public.trivia_players
  add column ballon_dors    smallint not null default 0,
  add column ballon_podiums smallint not null default 0;

-- Tiki-Taka-Toe categories, now with the Ballon d'Or.
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
  select 'award', 'ballondor', array_agg(p.id order by p.fame desc nulls last, p.id)
    from people p where p.ballon_podiums > 0
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

-- ---------------------------------------------------------------------------
-- Missing XI
-- ---------------------------------------------------------------------------
create table public.trivia_lineups (
  id          bigint generated always as identity primary key,
  key         text not null unique,          -- Wikipedia article title + side
  title       text not null,                 -- e.g. "2009 UEFA Champions League final"
  competition text not null,
  year        smallint not null,
  team        text not null,                 -- the Spanish side, e.g. "Barcelona"
  team_qid    text,
  -- [{ pos, number, playerId, captain }] in page order (GK first); the answers.
  players     jsonb not null
);

create table public.lineup_daily (
  day        date primary key,
  lineup_id  bigint not null references public.trivia_lineups (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.lineup_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null references public.lineup_daily (day) on delete cascade,
  guesses    jsonb not null default '[]'::jsonb,  -- [{ playerId, slot|null }]
  found      smallint not null default 0 check (found between 0 and 11),
  lives_left smallint not null default 5 check (lives_left between 0 and 5),
  finished   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Connections
-- ---------------------------------------------------------------------------
create table public.connections_daily (
  day        date primary key,
  puzzle     jsonb not null,   -- { groups: [{ label, ids[4] }], order: ids[16] }: the answers
  created_at timestamptz not null default now()
);

create table public.connections_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null references public.connections_daily (day) on delete cascade,
  solved     jsonb not null default '[]'::jsonb,  -- group indexes, in the order solved
  mistakes   smallint not null default 0 check (mistakes between 0 and 4),
  finished   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Odd One Out: the current round lives on the server; its answer is never readable.
-- ---------------------------------------------------------------------------
create table public.ooo_runs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  round      jsonb not null,    -- { prompt, category, options: ids[4] }
  answer_id  bigint not null,
  streak     integer not null default 0 check (streak >= 0),
  best       integer not null default 0 check (best >= 0),
  updated_at timestamptz not null default now()
);

create index lineup_attempts_day_idx on public.lineup_attempts (day);
create index connections_attempts_day_idx on public.connections_attempts (day);

create trigger lineup_attempts_updated_at before update on public.lineup_attempts
  for each row execute function public.set_updated_at();
create trigger connections_attempts_updated_at before update on public.connections_attempts
  for each row execute function public.set_updated_at();
create trigger ooo_runs_updated_at before update on public.ooo_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security: answers are server-only; results readable by league-mates;
-- all writes go through the server.
-- ---------------------------------------------------------------------------
alter table public.trivia_lineups        enable row level security;
alter table public.lineup_daily          enable row level security;
alter table public.lineup_attempts       enable row level security;
alter table public.connections_daily     enable row level security;
alter table public.connections_attempts  enable row level security;
alter table public.ooo_runs              enable row level security;

revoke all on public.trivia_lineups, public.lineup_daily, public.connections_daily
  from authenticated, anon;

create policy "lineup_attempts: read own and league-mates" on public.lineup_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
create policy "connections_attempts: read own and league-mates" on public.connections_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
create policy "ooo_runs: read own and league-mates" on public.ooo_runs
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());

revoke insert, update, delete on public.lineup_attempts, public.connections_attempts,
  public.ooo_runs from authenticated;

-- Odd One Out: players may read scores, never the current round or its answer.
revoke select on public.ooo_runs from authenticated;
grant select (user_id, streak, best, updated_at) on public.ooo_runs to authenticated;
