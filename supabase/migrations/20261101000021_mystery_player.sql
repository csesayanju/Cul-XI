-- Culé XI — Mystery Player: guess the day's hidden La Liga player; every guess is compared
-- with the answer (nation, position, birth year, clubs in common, Barça).

create table public.mystery_daily (
  day        date primary key,
  player_id  bigint not null references public.trivia_players (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.mystery_attempts (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  day        date not null references public.mystery_daily (day) on delete cascade,
  guesses    jsonb not null default '[]'::jsonb,   -- trivia player ids, in order
  solved     boolean not null default false,
  finished   boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

create index mystery_attempts_day_idx on public.mystery_attempts (day);
create trigger mystery_attempts_updated_at before update on public.mystery_attempts
  for each row execute function public.set_updated_at();

alter table public.mystery_daily    enable row level security;
alter table public.mystery_attempts enable row level security;

-- The day's player is the answer: server only.
revoke all on public.mystery_daily from authenticated, anon;

create policy "mystery_attempts: read own and league-mates" on public.mystery_attempts
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
revoke insert, update, delete on public.mystery_attempts from authenticated;
