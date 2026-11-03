-- Culé XI — trivia leaderboards (day / week / month), a 15-day archive of daily games and
-- "give up & reveal". Additive only: the live site keeps working unchanged.
--
-- `live`: the attempt was played on its own day and counts on leaderboards and streaks.
-- Archive (missed-day) plays are stored with live = false and never count.
-- `gave_up`: the player ended the game early to see the answers.

alter table public.trivia_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;
alter table public.ttt_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;
alter table public.career_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;
alter table public.connections_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;
alter table public.lineup_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;
alter table public.mystery_attempts
  add column live boolean not null default true,
  add column gave_up boolean not null default false;

-- Endless games: each user's best streak per day, so boards can show "best this week".
create table public.hol_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  best    integer not null default 0 check (best >= 0),
  primary key (user_id, day)
);
create table public.ooo_scores (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  best    integer not null default 0 check (best >= 0),
  primary key (user_id, day)
);
create index hol_scores_day_idx on public.hol_scores (day);
create index ooo_scores_day_idx on public.ooo_scores (day);

alter table public.hol_scores enable row level security;
alter table public.ooo_scores enable row level security;

create policy "hol_scores: read own and league-mates" on public.hol_scores
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());
create policy "ooo_scores: read own and league-mates" on public.ooo_scores
  for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());

revoke insert, update, delete on public.hol_scores, public.ooo_scores from authenticated;

-- Whether an attempt is live is decided once, when it's created: played on its own day
-- (India time) = live; a past day = archive. Updates never change it.
create or replace function public.stamp_attempt_live() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.live := new.day >= (now() at time zone 'Asia/Kolkata')::date;
  return new;
end;
$$;

create trigger trivia_attempts_live before insert on public.trivia_attempts
  for each row execute function public.stamp_attempt_live();
create trigger ttt_attempts_live before insert on public.ttt_attempts
  for each row execute function public.stamp_attempt_live();
create trigger career_attempts_live before insert on public.career_attempts
  for each row execute function public.stamp_attempt_live();
create trigger connections_attempts_live before insert on public.connections_attempts
  for each row execute function public.stamp_attempt_live();
create trigger lineup_attempts_live before insert on public.lineup_attempts
  for each row execute function public.stamp_attempt_live();
create trigger mystery_attempts_live before insert on public.mystery_attempts
  for each row execute function public.stamp_attempt_live();
