-- Culé XI — season stats, last-match stats and injury reports for pricing and availability.

alter table public.players
  -- Current-season totals across competitions, e.g.
  -- {"season":"26/27","games":11,"minutes":921,"goals":9,"assists":10,"cleanSheets":3,"teamGames":12}
  add column season_stats jsonb,
  add column season_stats_checked_at timestamptz,
  -- The player's team's most recent match (same shape as `form`, with matches = 1).
  add column last_match jsonb,
  -- Current injury from the provider, e.g. {"reason":"Hamstring injury","from":"2026-10-21","until":"2026-11-16"}.
  -- Null = fit (as far as we know).
  add column injury jsonb,
  -- Admin override when the report is wrong: 'fit' or 'injured'. Null = follow the report.
  add column injury_override text check (injury_override in ('fit', 'injured'));

comment on column public.players.market_value_checked_at is
  'When the player profile (market value + injury report) was last fetched.';
comment on column public.players.form is
  'Recent form over the last 30 days (up to 5 matches).';
