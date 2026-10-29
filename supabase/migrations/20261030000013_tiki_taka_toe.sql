-- Culé XI — Tiki-Taka-Toe: a daily 3×3 grid. Each cell needs a Barça player who matches its
-- row and column (another club he played for, nationality, position or decade at Barça).

-- Other clubs each repository player played for (one-time Wikidata import).
create table public.trivia_clubs (
  qid  text primary key,           -- Wikidata id, e.g. "Q8682" (Real Madrid)
  name text not null
);

create table public.trivia_player_clubs (
  player_id bigint not null references public.trivia_players (id) on delete cascade,
  club_qid  text not null references public.trivia_clubs (qid) on delete cascade,
  primary key (player_id, club_qid)
);

create index trivia_player_clubs_club_idx on public.trivia_player_clubs (club_qid);

-- The day's grid, frozen on first visit. It holds example answers, so only the server reads it.
create table public.ttt_daily (
  day        date primary key,
  grid       jsonb not null,
  created_at timestamptz not null default now()
);

create table public.ttt_attempts (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  day          date not null references public.ttt_daily (day) on delete cascade,
  -- Nine cells, row by row: the trivia player id placed there, or null.
  cells        jsonb not null default '[null,null,null,null,null,null,null,null,null]'::jsonb,
  filled       smallint not null default 0 check (filled between 0 and 9),
  guesses_left smallint not null default 9 check (guesses_left between 0 and 9),
  finished     boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, day)
);

create index ttt_attempts_day_idx on public.ttt_attempts (day);

create trigger ttt_attempts_updated_at before update on public.ttt_attempts
  for each row execute function public.set_updated_at();

alter table public.trivia_clubs        enable row level security;
alter table public.trivia_player_clubs enable row level security;
alter table public.ttt_daily           enable row level security;
alter table public.ttt_attempts        enable row level security;

create policy "trivia_clubs: read" on public.trivia_clubs
  for select to authenticated using (true);
create policy "trivia_player_clubs: read" on public.trivia_player_clubs
  for select to authenticated using (true);

-- ttt_daily: no policies — read and written by the server (service role) only.

create policy "ttt_attempts: read own and league-mates" on public.ttt_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());

revoke insert, update, delete on public.trivia_clubs from authenticated;
revoke insert, update, delete on public.trivia_player_clubs from authenticated;
revoke all on public.ttt_daily from authenticated;
revoke insert, update, delete on public.ttt_attempts from authenticated;
