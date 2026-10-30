-- Career Path: well-known players whose careers make a fair puzzle (4+ spells, every spell
-- dated), most famous first. Server-only (service role).
create or replace function public.career_candidates(min_fame integer, max_rows integer)
returns table (player_id bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.player_id
    from public.trivia_careers c
    join public.trivia_players p on p.id = c.player_id
   where p.fame >= min_fame
   group by c.player_id, p.fame
  having count(*) >= 4 and count(c.from_year) = count(*)
   order by p.fame desc, c.player_id
   limit max_rows;
$$;

revoke execute on function public.career_candidates(integer, integer) from public, anon, authenticated;
grant execute on function public.career_candidates(integer, integer) to service_role;
