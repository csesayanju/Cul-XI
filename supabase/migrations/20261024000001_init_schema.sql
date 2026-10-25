-- Culé XI — core schema
-- Tables for profiles, leagues, matches, players, fantasy teams, stats, points and the API cache.

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.profiles.is_admin is
  'Granted server-side when the user signs in with an email listed in ADMIN_EMAILS.';

-- ---------------------------------------------------------------------------
-- Leagues (friend groups) and membership
-- ---------------------------------------------------------------------------
create table public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  invite_code text not null,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index leagues_invite_code_key on public.leagues (lower(invite_code));

create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index league_members_user_idx on public.league_members (user_id);

-- ---------------------------------------------------------------------------
-- Matches (Barça fixtures)
-- ---------------------------------------------------------------------------
create table public.matches (
  id                   bigint generated always as identity primary key,
  api_fixture_id       integer not null unique,
  competition          text not null check (competition in ('laliga', 'ucl', 'copa')),
  api_league_id        integer not null,
  season               integer not null,
  round                text,
  opponent_team_id     integer not null,
  opponent_name        text not null,
  is_home              boolean not null,
  venue                text,
  kickoff_at           timestamptz not null,
  -- API-Football short status: NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC, ...
  status               text not null default 'NS',
  barca_goals          smallint,
  opponent_goals       smallint,
  squads_synced_at     timestamptz,
  lineups_synced_at    timestamptz,
  stats_synced_at      timestamptz,
  points_calculated_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index matches_kickoff_idx on public.matches (kickoff_at);

-- ---------------------------------------------------------------------------
-- Players and per-match availability
-- ---------------------------------------------------------------------------
create table public.players (
  id            bigint generated always as identity primary key,
  api_player_id integer not null unique,
  name          text not null,
  team_api_id   integer not null,
  team_name     text not null,
  position      text not null check (position in ('GK', 'DEF', 'MID', 'FWD')),
  shirt_number  smallint,
  -- Fantasy credits, e.g. 7.5. Defaults come from src/features/fantasy/pricing.ts; admin can edit.
  price         numeric(4, 1) not null check (price > 0 and price <= 20),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index players_team_idx on public.players (team_api_id);

create table public.match_players (
  match_id      bigint not null references public.matches (id) on delete cascade,
  player_id     bigint not null references public.players (id) on delete cascade,
  team_api_id   integer not null,
  is_available  boolean not null default true,
  lineup_status text not null default 'unknown'
    check (lineup_status in ('unknown', 'starting', 'bench', 'not_in_squad')),
  primary key (match_id, player_id)
);

create index match_players_player_idx on public.match_players (player_id);

-- ---------------------------------------------------------------------------
-- Fantasy teams (one per user per match)
-- ---------------------------------------------------------------------------
create table public.fantasy_teams (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  match_id   bigint not null references public.matches (id) on delete cascade,
  locked     boolean not null default false,
  locked_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index fantasy_teams_match_idx on public.fantasy_teams (match_id);

create table public.fantasy_team_players (
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  player_id       bigint not null references public.players (id) on delete restrict,
  is_captain      boolean not null default false,
  is_vice_captain boolean not null default false,
  -- Price when picked, so later admin price edits don't change the team's budget check.
  price           numeric(4, 1) not null check (price > 0),
  primary key (fantasy_team_id, player_id),
  check (not (is_captain and is_vice_captain))
);

-- At most one captain and one vice-captain per team.
create unique index fantasy_team_players_one_captain
  on public.fantasy_team_players (fantasy_team_id) where is_captain;
create unique index fantasy_team_players_one_vice
  on public.fantasy_team_players (fantasy_team_id) where is_vice_captain;

-- ---------------------------------------------------------------------------
-- Player match stats (from API or entered manually by an admin)
-- ---------------------------------------------------------------------------
create table public.player_match_stats (
  match_id          bigint not null references public.matches (id) on delete cascade,
  player_id         bigint not null references public.players (id) on delete cascade,
  minutes           smallint not null default 0 check (minutes between 0 and 130),
  goals             smallint not null default 0 check (goals >= 0),
  assists           smallint not null default 0 check (assists >= 0),
  clean_sheet       boolean not null default false,
  saves             smallint not null default 0 check (saves >= 0),
  goals_conceded    smallint not null default 0 check (goals_conceded >= 0),
  yellow_cards      smallint not null default 0 check (yellow_cards between 0 and 2),
  red_cards         smallint not null default 0 check (red_cards between 0 and 1),
  penalties_missed  smallint not null default 0 check (penalties_missed >= 0),
  penalties_saved   smallint not null default 0 check (penalties_saved >= 0),
  own_goals         smallint not null default 0 check (own_goals >= 0),
  -- 'manual' rows are never overwritten by the API sync.
  source            text not null default 'api' check (source in ('api', 'manual')),
  updated_by        uuid references public.profiles (id) on delete set null,
  updated_at        timestamptz not null default now(),
  primary key (match_id, player_id)
);

-- ---------------------------------------------------------------------------
-- Calculated fantasy points
-- ---------------------------------------------------------------------------
create table public.fantasy_points (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  match_id        bigint not null references public.matches (id) on delete cascade,
  fantasy_team_id uuid not null references public.fantasy_teams (id) on delete cascade,
  total_points    numeric(6, 1) not null,
  breakdown       jsonb not null default '{}'::jsonb,
  calculated_at   timestamptz not null default now(),
  primary key (user_id, match_id)
);

create index fantasy_points_match_idx on public.fantasy_points (match_id);

-- ---------------------------------------------------------------------------
-- API-Football response cache (server/service role only)
-- ---------------------------------------------------------------------------
create table public.api_cache (
  id          bigint generated always as identity primary key,
  endpoint    text not null,
  params_hash text not null,
  params      jsonb not null default '{}'::jsonb,
  response    jsonb not null,
  fetched_at  timestamptz not null default now(),
  unique (endpoint, params_hash)
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger matches_updated_at before update on public.matches
  for each row execute function public.set_updated_at();
create trigger players_updated_at before update on public.players
  for each row execute function public.set_updated_at();
create trigger fantasy_teams_updated_at before update on public.fantasy_teams
  for each row execute function public.set_updated_at();
create trigger player_match_stats_updated_at before update on public.player_match_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Create a profile automatically for every new auth user
-- ---------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
                  split_part(new.email, '@', 1),
                  'Culé'), 40)
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
