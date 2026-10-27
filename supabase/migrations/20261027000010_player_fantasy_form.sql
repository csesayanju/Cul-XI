-- Culé XI — fantasy points the player has been scoring, under Culé XI's own rules.

alter table public.players
  -- Over the team's recent matches (up to 5), e.g. {"matches":5,"points":27}.
  -- Matches the player missed count as 0 points.
  add column fantasy_form jsonb;
