-- Culé XI — market value as a "player status" signal for pricing.

alter table public.players
  -- Latest market value in euros (from the data provider). Null = unknown yet.
  add column market_value bigint check (market_value is null or market_value >= 0),
  -- When the market value was last fetched (refreshed monthly).
  add column market_value_checked_at timestamptz;
