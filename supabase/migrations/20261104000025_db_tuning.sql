-- Culé XI — database tuning (review with the backend-database-engineer skill).
--
-- 1. RLS that runs once per query, not once per row. Policies called auth.uid(), is_admin(),
--    shares_league_with(row.user_id) and is_league_member(row.league_id) for every row they
--    checked. Wrapping in a sub-select turns each into a one-off "InitPlan", and league-mate
--    checks become a hash lookup against a set computed once (Supabase's RLS guidance).
--    Same rules, same results: the mate set includes yourself, as shares_league_with did.
-- 2. Indexes for foreign keys that had none (parent deletes/updates scanned the child).
-- 3. A prefix index so two-letter autocomplete (too short for trigrams) stops scanning
--    every trivia person.

-- ---- 1. RLS -------------------------------------------------------------------------------

/** Everyone who shares a league with the current user (including the user). */
create function public.my_league_mate_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct theirs.user_id
  from public.league_members mine
  join public.league_members theirs on theirs.league_id = mine.league_id
  where mine.user_id = auth.uid();
$$;

/** The leagues the current user belongs to. */
create function public.my_league_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.league_id from public.league_members m where m.user_id = auth.uid();
$$;

revoke all on function public.my_league_mate_ids() from public, anon;
revoke all on function public.my_league_ids() from public, anon;
grant execute on function public.my_league_mate_ids() to authenticated, service_role;
grant execute on function public.my_league_ids() to authenticated, service_role;

-- Rewrite every public policy's USING / WITH CHECK in place (ALTER POLICY keeps names, roles
-- and commands). Only the expression text changes.
do $$
declare
  p record;
  rewrite text;
  q text;
  c text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
  loop
    q := p.qual;
    c := p.with_check;
    foreach rewrite in array array['q', 'c'] loop
      declare
        s text := case when rewrite = 'q' then q else c end;
      begin
        if s is null then continue; end if;
        s := regexp_replace(s, '\mauth\.uid\(\)', '(select auth.uid())', 'g');
        s := regexp_replace(s, '\m(public\.)?is_admin\(\)', '(select public.is_admin())', 'g');
        s := regexp_replace(
          s, '\m(public\.)?shares_league_with\((\w+)\)',
          '(\2 in (select public.my_league_mate_ids()))', 'g');
        s := regexp_replace(
          s, '\m(public\.)?is_league_member\((\w+)\)',
          '(\2 in (select public.my_league_ids()))', 'g');
        if rewrite = 'q' then q := s; else c := s; end if;
      end;
    end loop;

    if q is distinct from p.qual then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, q);
    end if;
    if c is distinct from p.with_check then
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, c);
    end if;
  end loop;
end
$$;

-- ---- 2. Foreign-key indexes ---------------------------------------------------------------
-- Small tables: a plain CREATE INDEX takes well under a second (CONCURRENTLY can't run in a
-- migration transaction and isn't needed at this size).

create index if not exists fantasy_team_players_player_idx on public.fantasy_team_players (player_id);
create index if not exists player_match_stats_player_idx on public.player_match_stats (player_id);
create index if not exists fantasy_points_team_idx on public.fantasy_points (fantasy_team_id);
create index if not exists trivia_list_entries_player_idx on public.trivia_list_entries (player_id);
create index if not exists trivia_careers_club_idx on public.trivia_careers (club_qid);
create index if not exists trivia_daily_list_idx on public.trivia_daily (list_id);

-- ---- 3. Short autocomplete ----------------------------------------------------------------
-- search_text is already lower-case and accent-free; text_pattern_ops serves `like 'ab%'`.
create index if not exists trivia_players_search_prefix_idx
  on public.trivia_players (search_text text_pattern_ops);
