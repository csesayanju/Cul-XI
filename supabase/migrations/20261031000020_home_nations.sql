-- Culé XI — England, Scotland, Wales and Northern Ireland play as separate football nations,
-- so players get their home nation's code (ISO 3166-2: GB-ENG, GB-SCT, GB-WLS, GB-NIR)
-- instead of the United Kingdom's GB. The Republic of Ireland stays IE.
alter table public.trivia_players drop constraint if exists trivia_players_country_code_check;
alter table public.trivia_players
  add constraint trivia_players_country_code_check
  check (country_code is null or country_code ~ '^[A-Z]{2}(-[A-Z]{3})?$');
