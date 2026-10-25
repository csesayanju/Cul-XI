-- Culé XI — atomic team save
-- Runs as the caller (security invoker), so RLS and the kickoff-lock trigger still apply.
-- Budget / formation / club limits are validated in the app (src/features/fantasy/validation)
-- and re-checked when points are calculated (invalid teams score 0).

create policy "fantasy_teams: touch own before kickoff"
  on public.fantasy_teams for update to authenticated
  using (public.can_edit_fantasy_team(id))
  with check (user_id = auth.uid());

create function public.save_fantasy_team(
  p_match_id bigint,
  p_player_ids bigint[],
  p_captain_id bigint,
  p_vice_captain_id bigint
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_team_id uuid;
  v_available int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if coalesce(array_length(p_player_ids, 1), 0) <> 11
     or (select count(distinct x) from unnest(p_player_ids) as x) <> 11 then
    raise exception 'A team needs exactly 11 different players' using errcode = '22023';
  end if;

  if p_captain_id is null or p_vice_captain_id is null or p_captain_id = p_vice_captain_id
     or not (p_captain_id = any (p_player_ids)) or not (p_vice_captain_id = any (p_player_ids)) then
    raise exception 'Captain and vice-captain must be two different players in the team'
      using errcode = '22023';
  end if;

  select count(*) into v_available
  from public.match_players mp
  where mp.match_id = p_match_id and mp.is_available and mp.player_id = any (p_player_ids);
  if v_available <> 11 then
    raise exception 'Some players are not available for this match' using errcode = '22023';
  end if;

  insert into public.fantasy_teams (user_id, match_id)
  values (auth.uid(), p_match_id)
  on conflict (user_id, match_id) do update set updated_at = now()
  returning id into v_team_id;

  delete from public.fantasy_team_players where fantasy_team_id = v_team_id;

  insert into public.fantasy_team_players (fantasy_team_id, player_id, is_captain, is_vice_captain)
  select v_team_id, pid, pid = p_captain_id, pid = p_vice_captain_id
  from unnest(p_player_ids) as pid;

  return v_team_id;
end;
$$;

revoke execute on function public.save_fantasy_team(bigint, bigint[], bigint, bigint) from public, anon;
grant execute on function public.save_fantasy_team(bigint, bigint[], bigint, bigint) to authenticated;
