# Trivia: Culé Ten

A daily top-10 game, playable at `/trivia`. Every player gets the same ranked list each day,
for example "Barça's top 10 scorers this season" or "Most Barça league appearances by players
from Brazil". You name the 10 players: each hidden slot shows a nationality hint, and a wrong
guess costs one of 3 lives. The list changes at midnight India time.

## How it works

- **Player repository** (`trivia_players`): every FC Barcelona player, imported **once** from
  Wikidata (free, no key, about 15–30 s). Re-run it from `/admin/trivia` or with
  `NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-import.ts`.
  Current squad players are linked by API id, with fuzzy name matching, so nobody is listed
  twice.
- **Lists** (`trivia_lists` and `trivia_list_entries`):
  - **auto:** generated from current-season data (goals, assists, minutes, appearances, market
    value) and frozen when scheduled. A list is skipped when a tie for 10th place would make
    it ambiguous.
  - **curated:** drafted from Wikidata's historical totals, which are patchy (for example,
    Patricio Toranzo shows 287 goals). An admin checks, fixes and approves each list on
    `/admin/trivia`. Only approved lists are played.
- **Schedule** (`trivia_daily`): on the first visit each day, the least recently used approved
  list is picked (curated lists are preferred, at most once every 45 days); otherwise an auto
  list.
- **Security:** answers are never readable by players (enforced by RLS). Guesses are checked
  on the server with the service role, and the browser only receives the hints and the
  players already found, or everything once the game is over. Attempts are written only by
  the server.

## Code

| File                                | What                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `game.ts`                           | Pure rules: guesses, lives, public view, day/streak, daily pick (+ tests) |
| `lists.ts`                          | Builds auto and Wikidata-draft lists (+ tests)                            |
| `matching.ts`                       | Matches current players to repository records (+ tests)                   |
| `server.ts`                         | Import, scheduling, playing, search, table (server only)                  |
| `components/player-search.tsx`      | Autocomplete used by the game and the admin editor                        |
| `src/lib/wikidata/barca-players.ts` | The Wikidata query and parser (+ tests)                                   |
