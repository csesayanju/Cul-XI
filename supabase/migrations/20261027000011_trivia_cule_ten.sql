-- Culé XI — "Culé Ten" daily trivia: name the 10 players in today's ranked list.

-- ---------------------------------------------------------------------------
-- Player repository (Barça players all-time from Wikidata + current players)
-- ---------------------------------------------------------------------------
create table public.trivia_players (
  id            bigint generated always as identity primary key,
  wikidata_id   text unique,                       -- e.g. "Q615" (null for API-only players)
  api_player_id bigint unique,                     -- Highlightly id when the player is current
  name          text not null,
  -- Lower-case, accent-free name + aliases, used for autocomplete ("pedri pedro gonzalez lopez").
  search_text   text not null,
  nationality   text,
  country_code  text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  position      text,
  birth_year    smallint,
  barca_from    smallint,
  barca_to      smallint,
  -- Barça totals from Wikidata (league matches; patchy, used only to draft lists for review).
  wd_apps       integer,
  wd_goals      integer,
  updated_at    timestamptz not null default now()
);

create index trivia_players_name_idx on public.trivia_players (name);

-- ---------------------------------------------------------------------------
-- Lists and their ranked answers
-- ---------------------------------------------------------------------------
create table public.trivia_lists (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 120),
  subtitle    text,
  -- 'auto' = generated from current data; 'curated' = drafted, then approved by an admin.
  kind        text not null check (kind in ('auto', 'curated')),
  status      text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  -- Stable key for auto lists so regenerating replaces rather than duplicates, e.g. "season-goals-26/27".
  auto_key    text unique,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.trivia_list_entries (
  list_id    uuid not null references public.trivia_lists (id) on delete cascade,
  rank       smallint not null check (rank between 1 and 10),
  player_id  bigint not null references public.trivia_players (id) on delete restrict,
  -- Shown when revealed, e.g. "9 goals".
  stat_label text,
  primary key (list_id, rank),
  unique (list_id, player_id)
);

-- ---------------------------------------------------------------------------
-- The daily schedule and each user's attempt
-- ---------------------------------------------------------------------------
create table public.trivia_daily (
  day        date primary key,
  list_id    uuid not null references public.trivia_lists (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.trivia_attempts (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  day         date not null references public.trivia_daily (day) on delete cascade,
  -- [{ "playerId": 123, "rank": 4 }] — rank null for a wrong guess.
  guesses     jsonb not null default '[]'::jsonb,
  found       smallint not null default 0 check (found between 0 and 10),
  lives_left  smallint not null default 3 check (lives_left between 0 and 3),
  finished    boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, day)
);

create index trivia_attempts_day_idx on public.trivia_attempts (day);

create trigger trivia_lists_updated_at before update on public.trivia_lists
  for each row execute function public.set_updated_at();
create trigger trivia_attempts_updated_at before update on public.trivia_attempts
  for each row execute function public.set_updated_at();
create trigger trivia_players_updated_at before update on public.trivia_players
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
--  * Answers (trivia_list_entries) are never readable by players: guesses are checked on the
--    server with the service role, which only returns what the player has earned.
--  * Lists' titles, the schedule and the player repository are readable when signed in.
--  * Attempts: your own, and league-mates' (for the trivia table). Writes go through the server.
-- ---------------------------------------------------------------------------
alter table public.trivia_players      enable row level security;
alter table public.trivia_lists        enable row level security;
alter table public.trivia_list_entries enable row level security;
alter table public.trivia_daily        enable row level security;
alter table public.trivia_attempts     enable row level security;

create policy "trivia_players: read" on public.trivia_players
  for select to authenticated using (true);
create policy "trivia_players: admin write" on public.trivia_players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "trivia_lists: read approved or as admin" on public.trivia_lists
  for select to authenticated using (status = 'approved' or public.is_admin());
create policy "trivia_lists: admin write" on public.trivia_lists
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "trivia_list_entries: admin only" on public.trivia_list_entries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "trivia_daily: read" on public.trivia_daily
  for select to authenticated using (true);

create policy "trivia_attempts: read own and league-mates" on public.trivia_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());

revoke insert, update, delete on public.trivia_attempts from authenticated;
revoke insert, update, delete on public.trivia_daily from authenticated;
