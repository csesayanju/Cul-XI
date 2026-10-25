-- Culé XI — widen external (data provider) ids to bigint
-- Highlightly match/team/player ids approach the 32-bit integer limit (~2.1 billion),
-- so every column holding a provider id becomes bigint.

alter table public.matches
  alter column api_fixture_id   type bigint,
  alter column api_league_id    type bigint,
  alter column opponent_team_id type bigint;

alter table public.players
  alter column api_player_id type bigint,
  alter column team_api_id   type bigint;

alter table public.match_players
  alter column team_api_id type bigint;
