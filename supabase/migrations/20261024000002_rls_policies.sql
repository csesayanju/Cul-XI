-- Culé XI — row-level security
-- Summary:
--   * Everyone signed in can read matches, players, availability and stats.
--   * Users read data for leagues they belong to; other members' teams become visible at kickoff.
--   * Users create/edit/delete only their own team, and only before kickoff.
--   * Only admins write stats, matches, players and points. Sync jobs use the service role,
--     which bypasses RLS.
--   * api_cache has RLS enabled and no policies: service role only.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.is_league_member(p_league_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id and m.user_id = auth.uid()
  );
$$;

create function public.shares_league_with(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.league_members mine
    join public.league_members theirs on theirs.league_id = mine.league_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

create function public.match_has_started(p_match_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select m.kickoff_at <= now() from public.matches m where m.id = p_match_id), true);
$$;

-- True if the current user owns the team and its match has not kicked off yet.
create function public.can_edit_fantasy_team(p_team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.fantasy_teams t
    join public.matches m on m.id = t.match_id
    where t.id = p_team_id
      and t.user_id = auth.uid()
      and not t.locked
      and m.kickoff_at > now()
  );
$$;

-- Join a league by invite code (case-insensitive). Returns the league id.
create function public.join_league(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_league_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  select l.id into v_league_id
  from public.leagues l
  where lower(l.invite_code) = lower(trim(p_code));

  if v_league_id is null then
    raise exception 'Invalid invite code' using errcode = 'P0002';
  end if;

  insert into public.league_members (league_id, user_id)
  values (v_league_id, auth.uid())
  on conflict do nothing;

  return v_league_id;
end;
$$;

revoke execute on function public.join_league(text) from public, anon;
grant execute on function public.join_league(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Defence in depth: block team changes after kickoff even if a policy is loosened later.
-- Runs as the caller, so the service role (sync jobs) and the postgres owner are exempt.
-- ---------------------------------------------------------------------------
create function public.enforce_team_editable() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_team_id uuid;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') or public.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'fantasy_teams' then
    if tg_op = 'INSERT' then
      if public.match_has_started(new.match_id) then
        raise exception 'This match has kicked off; teams are locked' using errcode = '42501';
      end if;
      return new;
    end if;
    v_team_id := old.id;
  else
    v_team_id := coalesce(new.fantasy_team_id, old.fantasy_team_id);
  end if;

  if not public.can_edit_fantasy_team(v_team_id) then
    raise exception 'This team is locked' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger fantasy_teams_editable
  before insert or update or delete on public.fantasy_teams
  for each row execute function public.enforce_team_editable();

create trigger fantasy_team_players_editable
  before insert or update or delete on public.fantasy_team_players
  for each row execute function public.enforce_team_editable();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.leagues              enable row level security;
alter table public.league_members       enable row level security;
alter table public.matches              enable row level security;
alter table public.players              enable row level security;
alter table public.match_players        enable row level security;
alter table public.fantasy_teams        enable row level security;
alter table public.fantasy_team_players enable row level security;
alter table public.player_match_stats   enable row level security;
alter table public.fantasy_points       enable row level security;
alter table public.api_cache            enable row level security;

-- Anonymous visitors get nothing; the app requires sign-in.
revoke all on all tables in schema public from anon;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles: read self, league-mates, or as admin"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_league_with(id) or public.is_admin());

create policy "profiles: update self"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles: admin update"
  on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Users may only change their display name (not is_admin).
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- leagues / league_members
-- ---------------------------------------------------------------------------
create policy "leagues: members and admins read"
  on public.leagues for select to authenticated
  using (public.is_league_member(id) or public.is_admin());

create policy "leagues: admin write"
  on public.leagues for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "league_members: read own leagues"
  on public.league_members for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

create policy "league_members: leave league"
  on public.league_members for delete to authenticated
  using (user_id = auth.uid());

create policy "league_members: admin write"
  on public.league_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- matches / players / match_players / player_match_stats: read for all, admin write
-- ---------------------------------------------------------------------------
create policy "matches: read" on public.matches for select to authenticated using (true);
create policy "matches: admin write" on public.matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "players: read" on public.players for select to authenticated using (true);
create policy "players: admin write" on public.players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "match_players: read" on public.match_players for select to authenticated using (true);
create policy "match_players: admin write" on public.match_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "stats: read" on public.player_match_stats for select to authenticated using (true);
create policy "stats: admin write" on public.player_match_stats for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- fantasy_teams / fantasy_team_players
-- ---------------------------------------------------------------------------
create policy "fantasy_teams: read own; league-mates after kickoff"
  on public.fantasy_teams for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or (public.shares_league_with(user_id) and public.match_has_started(match_id))
  );

create policy "fantasy_teams: create own before kickoff"
  on public.fantasy_teams for insert to authenticated
  with check (user_id = auth.uid() and not locked and not public.match_has_started(match_id));

create policy "fantasy_teams: delete own before kickoff"
  on public.fantasy_teams for delete to authenticated
  using (public.can_edit_fantasy_team(id));

create policy "fantasy_teams: admin write"
  on public.fantasy_teams for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Users never update team rows directly (lock flags are set by sync jobs).
revoke update on public.fantasy_teams from authenticated;
grant update (updated_at) on public.fantasy_teams to authenticated;

create policy "fantasy_team_players: read with team"
  on public.fantasy_team_players for select to authenticated
  using (
    exists (select 1 from public.fantasy_teams t where t.id = fantasy_team_id)
  );

create policy "fantasy_team_players: edit own before kickoff"
  on public.fantasy_team_players for all to authenticated
  using (public.can_edit_fantasy_team(fantasy_team_id))
  with check (public.can_edit_fantasy_team(fantasy_team_id));

create policy "fantasy_team_players: admin write"
  on public.fantasy_team_players for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- fantasy_points: read own + league-mates, admin write
-- ---------------------------------------------------------------------------
create policy "fantasy_points: read own and league-mates"
  on public.fantasy_points for select to authenticated
  using (user_id = auth.uid() or public.shares_league_with(user_id) or public.is_admin());

create policy "fantasy_points: admin write"
  on public.fantasy_points for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- api_cache: RLS enabled, intentionally no policies (service role only).
revoke all on public.api_cache from authenticated;
