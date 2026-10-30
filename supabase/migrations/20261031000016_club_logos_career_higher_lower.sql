-- Culé XI — club badges for Tiki-Taka-Toe, and two more daily/endless trivia games:
--  * Career Path: guess the player from his club history (daily, same for everyone);
--  * Higher or Lower: who scored more La Liga goals? (endless streaks, checked on the server).

-- Club logos: only free files on Wikimedia Commons (Wikidata P154). Never FC Barcelona's.
alter table public.trivia_clubs add column logo_file text;

-- ---------------------------------------------------------------------------
-- Career Path
-- ---------------------------------------------------------------------------
create table public.trivia_careers (
  player_id bigint   not null references public.trivia_players (id) on delete cascade,
  seq       smallint not null,                 -- order of the spells, from 1
  club_qid  text     not null references public.trivia_clubs (qid) on delete cascade,
  from_year smallint,
  to_year   smallint,
  primary key (player_id, seq)
);

-- The day's mystery player: the answer, so only the server reads it.
create table public.career_daily (
  day        date primary key,
  player_id  bigint not null references public.trivia_players (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.career_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null references public.career_daily (day) on delete cascade,
  guesses    jsonb not null default '[]'::jsonb,   -- trivia player ids, in order
  solved     boolean not null default false,
  finished   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index career_attempts_day_idx on public.career_attempts (day);
create trigger career_attempts_updated_at before update on public.career_attempts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Higher or Lower: one running streak per user, the next pair kept on the server.
-- ---------------------------------------------------------------------------
create table public.hol_runs (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  a_id       bigint not null references public.trivia_players (id) on delete cascade,
  b_id       bigint not null references public.trivia_players (id) on delete cascade,
  streak     integer not null default 0 check (streak >= 0),
  best       integer not null default 0 check (best >= 0),
  updated_at timestamptz not null default now()
);

create trigger hol_runs_updated_at before update on public.hol_runs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.trivia_careers  enable row level security;
alter table public.career_daily    enable row level security;
alter table public.career_attempts enable row level security;
alter table public.hol_runs        enable row level security;

-- Careers aren't secret on their own (the daily pick is): readable when signed in.
create policy "trivia_careers: read" on public.trivia_careers
  for select to authenticated using (true);
revoke insert, update, delete on public.trivia_careers from authenticated;

-- career_daily: no policies — server only.
revoke all on public.career_daily from authenticated;

create policy "career_attempts: read own and league-mates" on public.career_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
revoke insert, update, delete on public.career_attempts from authenticated;

create policy "hol_runs: read own and league-mates" on public.hol_runs
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
revoke insert, update, delete on public.hol_runs from authenticated;
