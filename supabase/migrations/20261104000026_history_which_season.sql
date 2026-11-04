-- Culé XI — season-by-season history (Wikipedia, CC BY-SA) and the "Which Season?" game.
--
-- History tables hold facts only, keyed by stable natural keys (a season's start year, a
-- match key), upserted idempotently by scripts/history-import.ts. They are read on the
-- server only: the daily season is the answer, and its clues come from these rows.

-- ---- History ------------------------------------------------------------------------------

create table public.barca_seasons (
  start_year       smallint primary key check (start_year between 1899 and 2100),
  season           text not null unique,           -- "2008–09"
  division         text not null,
  played           smallint not null check (played >= 0),
  won              smallint not null check (won >= 0),
  drawn            smallint not null check (drawn >= 0),
  lost             smallint not null check (lost >= 0),
  goals_for        smallint not null check (goals_for >= 0),
  goals_against    smallint not null check (goals_against >= 0),
  points           smallint not null,
  position         smallint not null check (position >= 1),
  copa             text,                            -- round reached; null = didn't enter
  europe           jsonb,                           -- { competition, result }
  others           jsonb not null default '[]'::jsonb,
  top_scorers      text[] not null default '{}',
  top_scorer_goals smallint,
  -- The season still being played (excluded from games until it's over).
  complete         boolean not null default true,
  fetched_at       timestamptz not null default now(),
  check (won + drawn + lost = played)
);

create table public.liga_seasons (
  start_year        smallint primary key check (start_year between 1899 and 2100),
  season            text not null unique,
  champion          text not null,
  champion_points   smallint,
  runner_up         text not null,
  runner_up_points  smallint,
  third             text,
  third_points      smallint,
  top_scorers       text[] not null default '{}',
  top_scorer_clubs  text[] not null default '{}',
  top_scorer_goals  smallint,
  fetched_at        timestamptz not null default now()
);

create table public.clasicos (
  key           text primary key,                  -- competition|date-or-season|round|home
  competition   text not null,
  season        text not null,
  start_year    smallint not null,
  played_on     date,                              -- league matches; cups list the season only
  round         text,
  home          text not null check (home in ('Barcelona', 'Real Madrid')),
  home_goals    smallint not null check (home_goals >= 0),
  away_goals    smallint not null check (away_goals >= 0),
  note          text,                              -- "a.e.t.", penalties…
  home_scorers  text,
  away_scorers  text,
  fetched_at    timestamptz not null default now()
);

-- Head-to-head by season and "the Clásicos of 2008–09" read by season.
create index clasicos_start_year_idx on public.clasicos (start_year);

-- ---- Which Season? --------------------------------------------------------------------------

create table public.season_daily (
  day        date primary key,
  start_year smallint not null references public.barca_seasons (start_year) on delete restrict,
  created_at timestamptz not null default now()
);
create index season_daily_start_year_idx on public.season_daily (start_year);

create table public.season_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null references public.season_daily (day) on delete cascade,
  guesses    jsonb not null default '[]'::jsonb,   -- guessed start years, in order
  solved     boolean not null default false,
  finished   boolean not null default false,
  live       boolean not null default true,
  gave_up    boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);
create index season_attempts_day_idx on public.season_attempts (day);
create trigger season_attempts_updated_at before update on public.season_attempts
  for each row execute function public.set_updated_at();
create trigger season_attempts_live before insert on public.season_attempts
  for each row execute function public.stamp_attempt_live();

-- ---- RLS ------------------------------------------------------------------------------------

alter table public.barca_seasons   enable row level security;
alter table public.liga_seasons    enable row level security;
alter table public.clasicos        enable row level security;
alter table public.season_daily    enable row level security;
alter table public.season_attempts enable row level security;

-- History and the daily pick: server only (clues would give the answer away).
revoke all on public.barca_seasons, public.liga_seasons, public.clasicos, public.season_daily
  from anon, authenticated;
create policy "barca_seasons: admin read" on public.barca_seasons
  for select to authenticated using ((select public.is_admin()));
create policy "liga_seasons: admin read" on public.liga_seasons
  for select to authenticated using ((select public.is_admin()));
create policy "clasicos: admin read" on public.clasicos
  for select to authenticated using ((select public.is_admin()));
grant select on public.barca_seasons, public.liga_seasons, public.clasicos to authenticated;

create policy "season_attempts: read own and league-mates" on public.season_attempts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.my_league_mate_ids())
    or (select public.is_admin())
  );
revoke insert, update, delete on public.season_attempts from anon, authenticated;
