# Trivia: Culé Ten

A daily top-10 game, playable at `/trivia`. Every player gets the same ranked list each day,
for example "Barça's top 10 scorers this season", "Barça's longest-serving presidents" or
"Most league games for Barça by players from Brazil". You name the 10 people: each hidden slot
shows a nationality hint (and, for history lists, an era such as "1990s–2000s"), and a wrong
guess costs one of 3 lives. The list changes at midnight India time.

## How it works

- **Player repository** (`trivia_players`): every FC Barcelona player, imported **once** from
  Wikidata (free, no key, about 15–30 s). Re-run it from `/admin/trivia` or with
  `NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-import.ts`.
  Current squad players are linked by API id, with fuzzy name matching, so nobody is listed
  twice.
- **Barça history** (`trivia_sources`): five Wikipedia list articles (players with 100+
  appearances, records and statistics, seasons, managers, presidents) are parsed **once** and
  the facts stored. Re-run from `/admin/trivia` or with
  `NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-history.ts`. People are
  matched to the repository by Wikidata id; managers, presidents and missing players are
  added (`roles`).
- **All of La Liga** (`scripts/trivia-la-liga.ts`, ~2 min, run locally): every club that has
  played in La Liga and everyone who played for them (Wikidata, with fame = Wikipedia
  sitelinks for ranking), club links, La Liga goals/apps, Pichichi and Zamora trophies, and
  La Liga lists (records, eras, foreign/Spanish scorers, Real Madrid and Athletic scorers).
  Search uses a trigram index and ranks by fame.
- **Lists** (`trivia_lists` and `trivia_list_entries`):
  - **auto:** generated from current-season data (goals, assists, minutes, appearances, market
    value) and frozen when scheduled. A list is skipped when a tie for 10th place would make
    it ambiguous.
  - **curated:** drafted from Wikidata's historical totals, which are patchy (for example,
    Patricio Toranzo shows 287 goals). An admin checks, fixes and approves each list on
    `/admin/trivia`. Only approved lists are played.
  - **wikipedia:** about 36 history lists (records, nations, positions, eras, captains,
    goals per game, seasons, managers, presidents). Each is checked: exactly 10 different
    people, all matched, in descending order, no tie for 10th. Lists that pass go live; the
    rest are drafts. Re-importing never changes a list that is approved or archived.
- **Schedule** (`trivia_daily`): on the first visit each day, the least recently used approved
  list is picked (curated lists are preferred, at most once every 45 days); otherwise an auto
  list.
- **Security:** answers are never readable by players (enforced by RLS). Guesses are checked
  on the server with the service role, and the browser only receives the hints and the
  players already found, or everything once the game is over. Attempts are written only by
  the server.

## Code

| File                                 | What                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `game.ts`                            | Pure rules: guesses, lives, public view, day/streak, daily pick (+ tests) |
| `lists.ts`                           | Builds auto and Wikidata-draft lists (+ tests)                            |
| `history-lists.ts`                   | Builds and checks the Wikipedia history lists (+ tests)                   |
| `liga-lists.ts`                      | La Liga lists from Wikipedia, same checks (+ tests)                       |
| `liga-import.ts`                     | The one-time La Liga import (server only)                                 |
| `matching.ts`                        | Matches current players to repository records (+ tests)                   |
| `server.ts`                          | Import, scheduling, playing, search, table (server only)                  |
| `components/player-search.tsx`       | Autocomplete used by the game and the admin editor                        |
| `src/lib/wikidata/barca-players.ts`  | The Wikidata query and parser (+ tests)                                   |
| `src/lib/wikipedia/barca-history.ts` | Fetches and parses the Wikipedia list articles                            |
