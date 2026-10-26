-- Culé XI — performance-based prices, player photos, admin price locks.

alter table public.players
  -- Photo URL from the data provider (Highlightly). Null = show initials.
  add column photo_url text,
  -- Recent form summary used for pricing and shown in the team builder, e.g.
  -- {"matches":3,"apps":3,"starts":2,"minutes":231,"goals":1,"assists":2,"avgRating":7.3}
  add column form jsonb not null default '{}'::jsonb,
  -- true once an admin sets the price by hand: automatic re-pricing then leaves it alone.
  add column price_locked boolean not null default false;

comment on column public.players.price is
  'Credits. Recalculated from recent form on each squad sync unless price_locked.';
