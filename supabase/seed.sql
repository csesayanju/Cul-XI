-- Culé XI — local development seed. ALL DATA IS FICTIONAL.
-- Users sign in locally with magic links captured by Supabase's Inbucket/Mailpit (http://localhost:54324).
-- Team / player names are invented; opponent team ids 9001/9002 do not exist in API-Football.

-- ---------------------------------------------------------------------------
-- Users (profiles are created by the on_auth_user_created trigger)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'admin@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Admin Ana"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bruno@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Bruno"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'carla@example.com', '', now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Carla"}', now(), now(), '', '', '', '');

update public.profiles set is_admin = true where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- League
-- ---------------------------------------------------------------------------
insert into public.leagues (id, name, invite_code, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Culé XI Friends', 'local-dev-code',
   '11111111-1111-1111-1111-111111111111');

insert into public.league_members (league_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------------
-- Matches: one finished, one upcoming
-- ---------------------------------------------------------------------------
insert into public.matches (
  api_fixture_id, competition, api_league_id, season, round, opponent_team_id, opponent_name,
  is_home, venue, kickoff_at, status, barca_goals, opponent_goals
) values
  (990001, 'laliga', 140, 2026, 'Regular Season - 9', 9001, 'Real Ficticio',
   true, 'Home Stadium', now() - interval '3 days', 'FT', 2, 1),
  (990002, 'ucl', 2, 2026, 'League Stage - 4', 9002, 'Atlético Imaginario',
   false, 'Away Arena', now() + interval '3 days', 'NS', null, null);

-- ---------------------------------------------------------------------------
-- Players (fictional)
-- ---------------------------------------------------------------------------
insert into public.players (api_player_id, name, team_api_id, team_name, position, shirt_number, price) values
  -- Barcelona (529)
  (900001, 'Marc Ferrer',     529, 'Barcelona', 'GK',  1,  5.5),
  (900002, 'Pau Vidal',       529, 'Barcelona', 'GK',  13, 4.5),
  (900003, 'Jordi Puig',      529, 'Barcelona', 'DEF', 2,  6.0),
  (900004, 'Àlex Serra',      529, 'Barcelona', 'DEF', 3,  5.5),
  (900005, 'Oriol Roca',      529, 'Barcelona', 'DEF', 4,  5.5),
  (900006, 'Biel Soler',      529, 'Barcelona', 'DEF', 5,  5.0),
  (900007, 'Nil Casals',      529, 'Barcelona', 'DEF', 15, 4.5),
  (900008, 'Arnau Font',      529, 'Barcelona', 'MID', 8,  8.5),
  (900009, 'Pol Riera',       529, 'Barcelona', 'MID', 6,  7.5),
  (900010, 'Gerard Mas',      529, 'Barcelona', 'MID', 16, 7.0),
  (900011, 'Quim Bosch',      529, 'Barcelona', 'MID', 20, 6.5),
  (900012, 'Martí Pujol',     529, 'Barcelona', 'MID', 21, 6.0),
  (900013, 'Iker Sala',       529, 'Barcelona', 'FWD', 9,  10.5),
  (900014, 'Hugo Prat',       529, 'Barcelona', 'FWD', 11, 9.0),
  (900015, 'Leo Camps',       529, 'Barcelona', 'FWD', 19, 7.5),
  -- Real Ficticio (9001)
  (910001, 'Diego Ruiz',      9001, 'Real Ficticio', 'GK',  1,  5.0),
  (910002, 'Sergio Molina',   9001, 'Real Ficticio', 'GK',  25, 4.5),
  (910003, 'Javier Ortega',   9001, 'Real Ficticio', 'DEF', 2,  5.0),
  (910004, 'Carlos Navarro',  9001, 'Real Ficticio', 'DEF', 4,  5.0),
  (910005, 'Pablo Gil',       9001, 'Real Ficticio', 'DEF', 5,  4.5),
  (910006, 'Luis Romero',     9001, 'Real Ficticio', 'DEF', 3,  4.5),
  (910007, 'Raúl Castro',     9001, 'Real Ficticio', 'DEF', 22, 4.5),
  (910008, 'Andrés Vega',     9001, 'Real Ficticio', 'MID', 10, 7.0),
  (910009, 'Mario Herrera',   9001, 'Real Ficticio', 'MID', 8,  6.5),
  (910010, 'Tomás Díaz',      9001, 'Real Ficticio', 'MID', 6,  6.0),
  (910011, 'Rubén Ortiz',     9001, 'Real Ficticio', 'MID', 14, 5.5),
  (910012, 'Iván Medina',     9001, 'Real Ficticio', 'MID', 18, 5.0),
  (910013, 'Álvaro Cano',     9001, 'Real Ficticio', 'FWD', 9,  8.5),
  (910014, 'Daniel Rojas',    9001, 'Real Ficticio', 'FWD', 7,  7.0),
  (910015, 'Adrián León',     9001, 'Real Ficticio', 'FWD', 17, 6.0),
  -- Atlético Imaginario (9002)
  (920001, 'Emil Strand',     9002, 'Atlético Imaginario', 'GK',  1,  5.0),
  (920002, 'Lars Berg',       9002, 'Atlético Imaginario', 'GK',  12, 4.5),
  (920003, 'Jonas Falk',      9002, 'Atlético Imaginario', 'DEF', 2,  5.0),
  (920004, 'Erik Lund',       9002, 'Atlético Imaginario', 'DEF', 4,  5.0),
  (920005, 'Nils Dahl',       9002, 'Atlético Imaginario', 'DEF', 5,  4.5),
  (920006, 'Olof Ek',         9002, 'Atlético Imaginario', 'DEF', 3,  4.5),
  (920007, 'Axel Holm',       9002, 'Atlético Imaginario', 'DEF', 23, 4.5),
  (920008, 'Viktor Sand',     9002, 'Atlético Imaginario', 'MID', 10, 7.0),
  (920009, 'Oskar Lind',      9002, 'Atlético Imaginario', 'MID', 8,  6.5),
  (920010, 'Anton Wik',       9002, 'Atlético Imaginario', 'MID', 6,  6.0),
  (920011, 'Filip Nord',      9002, 'Atlético Imaginario', 'MID', 14, 5.5),
  (920012, 'Gustav Ry',       9002, 'Atlético Imaginario', 'MID', 16, 5.0),
  (920013, 'Malte Kron',      9002, 'Atlético Imaginario', 'FWD', 9,  8.5),
  (920014, 'Linus Bäck',      9002, 'Atlético Imaginario', 'FWD', 11, 7.0),
  (920015, 'Elias Fors',      9002, 'Atlético Imaginario', 'FWD', 19, 6.0);

-- Every Barça player + the opponent's players are available for each match.
insert into public.match_players (match_id, player_id, team_api_id)
select m.id, p.id, p.team_api_id
from public.matches m
join public.players p on p.team_api_id in (529, m.opponent_team_id);

-- ---------------------------------------------------------------------------
-- Stats for the finished match (Barça 2–1 Real Ficticio)
-- ---------------------------------------------------------------------------
insert into public.player_match_stats (
  match_id, player_id, minutes, goals, assists, clean_sheet, saves, goals_conceded,
  yellow_cards, red_cards, penalties_missed, penalties_saved, own_goals, source
)
select m.id, p.id, s.minutes, s.goals, s.assists, s.clean_sheet, s.saves, s.goals_conceded,
       s.yellow_cards, s.red_cards, s.penalties_missed, s.penalties_saved, s.own_goals, 'api'
from (values
  -- api_player_id, min, g, a, cs, saves, conceded, yc, rc, pen_miss, pen_save, og
  (900001, 90, 0, 0, false, 4, 1, 0, 0, 0, 0, 0),
  (900003, 90, 0, 0, false, 0, 1, 0, 0, 0, 0, 0),
  (900004, 90, 0, 0, false, 0, 1, 1, 0, 0, 0, 0),
  (900005, 90, 0, 1, false, 0, 1, 0, 0, 0, 0, 0),
  (900006, 75, 0, 0, false, 0, 1, 0, 0, 0, 0, 0),
  (900008, 90, 1, 1, false, 0, 0, 0, 0, 0, 0, 0),
  (900009, 90, 0, 0, false, 0, 0, 1, 0, 0, 0, 0),
  (900010, 60, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (900011, 30, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (900013, 90, 1, 0, false, 0, 0, 0, 0, 1, 0, 0),
  (900014, 70, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (900015, 20, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (910001, 90, 0, 0, false, 5, 2, 0, 0, 0, 1, 0),
  (910003, 90, 0, 0, false, 0, 2, 1, 0, 0, 0, 0),
  (910004, 90, 0, 0, false, 0, 2, 0, 0, 0, 0, 0),
  (910005, 90, 0, 0, false, 0, 2, 0, 0, 0, 0, 0),
  (910006, 64, 0, 0, false, 0, 1, 0, 1, 0, 0, 0),
  (910008, 90, 0, 1, false, 0, 0, 1, 0, 0, 0, 0),
  (910009, 90, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (910010, 80, 0, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (910013, 90, 1, 0, false, 0, 0, 0, 0, 0, 0, 0),
  (910014, 45, 0, 0, false, 0, 0, 0, 0, 0, 0, 0)
) as s(api_player_id, minutes, goals, assists, clean_sheet, saves, goals_conceded,
       yellow_cards, red_cards, penalties_missed, penalties_saved, own_goals)
join public.players p on p.api_player_id = s.api_player_id
cross join public.matches m
where m.api_fixture_id = 990001;

update public.matches set stats_synced_at = now() where api_fixture_id = 990001;

-- ---------------------------------------------------------------------------
-- Fantasy teams (valid: 11 players, <= 100 credits, <= 7 per club, legal formation)
-- Points are not seeded: use /admin -> "Recalculate points" to compute them.
-- ---------------------------------------------------------------------------
insert into public.fantasy_teams (id, user_id, match_id, locked, locked_at)
select t.id::uuid, t.user_id::uuid, m.id, t.locked, case when t.locked then m.kickoff_at end
from (values
  ('f0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 990001, true),
  ('f0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 990001, true),
  ('f0000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 990002, false)
) as t(id, user_id, api_fixture_id, locked)
join public.matches m on m.api_fixture_id = t.api_fixture_id;

insert into public.fantasy_team_players (fantasy_team_id, player_id, is_captain, is_vice_captain)
select t.team_id::uuid, p.id, t.is_captain, t.is_vice
from (values
  -- Admin Ana, match 1: 1-4-4-2, Barça x7
  ('f0000000-0000-0000-0000-000000000001', 900001, false, false),
  ('f0000000-0000-0000-0000-000000000001', 900003, false, false),
  ('f0000000-0000-0000-0000-000000000001', 900004, false, false),
  ('f0000000-0000-0000-0000-000000000001', 900005, false, false),
  ('f0000000-0000-0000-0000-000000000001', 910003, false, false),
  ('f0000000-0000-0000-0000-000000000001', 900008, true,  false),
  ('f0000000-0000-0000-0000-000000000001', 900009, false, true),
  ('f0000000-0000-0000-0000-000000000001', 910008, false, false),
  ('f0000000-0000-0000-0000-000000000001', 910009, false, false),
  ('f0000000-0000-0000-0000-000000000001', 900013, false, false),
  ('f0000000-0000-0000-0000-000000000001', 910013, false, false),
  -- Bruno, match 1: 1-4-4-2, Barça x6
  ('f0000000-0000-0000-0000-000000000002', 910001, false, false),
  ('f0000000-0000-0000-0000-000000000002', 900003, false, false),
  ('f0000000-0000-0000-0000-000000000002', 900005, false, false),
  ('f0000000-0000-0000-0000-000000000002', 910003, false, false),
  ('f0000000-0000-0000-0000-000000000002', 910004, false, false),
  ('f0000000-0000-0000-0000-000000000002', 900008, false, false),
  ('f0000000-0000-0000-0000-000000000002', 900010, false, false),
  ('f0000000-0000-0000-0000-000000000002', 910008, false, false),
  ('f0000000-0000-0000-0000-000000000002', 910010, false, false),
  ('f0000000-0000-0000-0000-000000000002', 900013, true,  false),
  ('f0000000-0000-0000-0000-000000000002', 900014, false, true),
  -- Carla, match 2 (upcoming, still editable): 1-3-5-2, Barça x7
  ('f0000000-0000-0000-0000-000000000003', 900001, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900003, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900004, false, false),
  ('f0000000-0000-0000-0000-000000000003', 920003, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900008, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900009, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900010, false, false),
  ('f0000000-0000-0000-0000-000000000003', 920008, false, false),
  ('f0000000-0000-0000-0000-000000000003', 920009, false, false),
  ('f0000000-0000-0000-0000-000000000003', 900013, true,  false),
  ('f0000000-0000-0000-0000-000000000003', 920013, false, true)
) as t(team_id, api_player_id, is_captain, is_vice)
join public.players p on p.api_player_id = t.api_player_id;
