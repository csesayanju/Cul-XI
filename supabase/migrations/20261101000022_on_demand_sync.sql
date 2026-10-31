-- Culé XI — line-ups and stats are also fetched when people open the app around a match
-- (GitHub's scheduled runs can be hours late). These record the last check so a busy page
-- calls the API at most once per window.
alter table public.matches
  add column lineups_checked_at timestamptz,
  add column stats_checked_at   timestamptz;

/**
 * Atomically claims a check: true (and stamps the time) only if nobody checked this match's
 * line-ups/stats within `every`. Server-only.
 */
create or replace function public.claim_match_check(p_match bigint, p_kind text, p_every interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed bigint;
begin
  if p_kind = 'lineups' then
    update public.matches set lineups_checked_at = now()
     where id = p_match and (lineups_checked_at is null or lineups_checked_at < now() - p_every)
     returning id into claimed;
  elsif p_kind = 'stats' then
    update public.matches set stats_checked_at = now()
     where id = p_match and (stats_checked_at is null or stats_checked_at < now() - p_every)
     returning id into claimed;
  end if;
  return claimed is not null;
end;
$$;

revoke execute on function public.claim_match_check(bigint, text, interval) from public, anon, authenticated;
grant execute on function public.claim_match_check(bigint, text, interval) to service_role;
