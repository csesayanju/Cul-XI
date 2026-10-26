-- Culé XI — player photos from Wikimedia Commons, with attribution.

alter table public.players
  -- Full registered name from the data provider (better for photo lookups than "A. Gordon").
  add column full_name text,
  -- Attribution for photo_url, e.g. "Jane Doe · CC BY-SA 4.0", and the file's Commons page.
  add column photo_credit text,
  add column photo_page_url text,
  -- When the automatic photo lookup last ran for this player (null = never).
  add column photo_checked_at timestamptz,
  -- true once an admin sets or removes the photo by hand: lookups then leave it alone.
  add column photo_locked boolean not null default false;
