# Culé XI

A private, free-to-play fantasy football app for a small group of friends, built around
**FC Barcelona matches only** (LaLiga, Champions League, Copa del Rey). There's no real money,
no payments and no app store listing.

For every Barça match you pick 11 players from Barça and that day's opponent. Points arrive
after full time, and there's a leaderboard for each match plus one for the season.

> Not affiliated with FC Barcelona. The app uses player names and initials only, with no
> crests, logos, kits or photos.

## How it plays

- **Squad:** 11 players from the combined squads of Barça and the opponent
- **Budget:** 100 credits
- **Club limit:** at most 7 players from one team
- **Formation:** 1 GK, 3–5 DEF, 3–5 MID, 1–3 FWD
- **Armband:** one captain (×2 points) and one vice-captain (×1.5, only counts if the captain
  doesn't play)
- **Deadline:** teams lock at kickoff. Points are calculated once, after full time.
- **Leagues:** friends join with an invite code.
- **Admin:** syncs data, fixes stats and recalculates points.

### Scoring

All values live in [`src/features/fantasy/scoring/rules.ts`](src/features/fantasy/scoring/rules.ts).

| Event                                                                  |  GK | DEF | MID | FWD |
| ---------------------------------------------------------------------- | --: | --: | --: | --: |
| Appearance, 60+ minutes                                                |   2 |   2 |   2 |   2 |
| Appearance, under 60 minutes                                           |   1 |   1 |   1 |   1 |
| Goal                                                                   |   6 |   6 |   5 |   4 |
| Assist                                                                 |   3 |   3 |   3 |   3 |
| Clean sheet (needs 60+ minutes)                                        |   4 |   4 |   1 |   0 |
| Every 3 saves                                                          |   1 |   – |   – |   – |
| Penalty saved                                                          |   5 |   5 |   5 |   5 |
| Penalty missed                                                         |  −2 |  −2 |  −2 |  −2 |
| Every 2 goals conceded                                                 |  −1 |  −1 |   – |   – |
| Yellow card                                                            |  −1 |  −1 |  −1 |  −1 |
| Red card                                                               |  −3 |  −3 |  −3 |  −3 |
| Own goal                                                               |  −2 |  −2 |  −2 |  −2 |
| **Captain** ×2 · **Vice-captain** ×1.5 if the captain played 0 minutes |

A player with 0 minutes scores 0. If a saved team breaks the rules (for example, someone
bypassed the UI), it scores 0 and the reason is shown.

## Tech stack

- **Framework:** Next.js 16 (App Router) with strict TypeScript and Tailwind CSS v4
- **Backend:** Supabase for magic-link auth, Postgres and row-level security
- **Data:** the [Highlightly Football API](https://highlightly.net/football-api/) free plan,
  via the direct API rather than RapidAPI. It's called only from server code.
- **Tooling:** Vitest, ESLint and Prettier, managed with pnpm
- **Hosting:** ready to deploy on Vercel

## Setup

You'll need Node 20.9 or later (22 recommended) and pnpm 10 (`npm i -g pnpm`).

### 1. Install

```bash
pnpm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com/dashboard). The free tier is fine.
2. Go to **Project Settings → API** and copy the **Project URL**, the **anon** key and the
   **service_role** key.
3. Go to **Authentication → URL Configuration**:
   - set **Site URL** to your app URL (`http://localhost:3000` for now)
   - add `http://localhost:3000/auth/callback` to **Redirect URLs**, plus your Vercel URL with
     `/auth/callback` later

#### Optional: Google sign-in and guest play

The sign-in page shows these buttons automatically once they're switched on in Supabase.

- **Play as a guest:** in **Authentication → Sign In / Providers**, turn on **Allow anonymous
  sign-ins**. Guests need no email but still need the invite code. Their account lives in one
  browser only.
- **Google:**
  1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
     **OAuth client ID** of type **Web application**.
  2. Add `https://<your-project-ref>.supabase.co/auth/v1/callback` as an **Authorized redirect
     URI**.
  3. In Supabase, open **Authentication → Sign In / Providers → Google**, turn it on and paste
     the client ID and secret.

### 3. Get a Highlightly key

Sign up at [highlightly.net](https://highlightly.net/login), choose the free **Basic** plan for
the Football API and copy your API key. Use Highlightly's own site, not RapidAPI: the two have
separate accounts and keys.

> Why not API-Football? Its free plan only covers the 2022–2024 seasons. Highlightly's free
> plan includes the current season.

### 4. Configure environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env.local
```

Each variable is explained in [`.env.example`](.env.example). `.env.local` is git-ignored, so
never commit it. If a required variable is missing, the app stops with a clear list of what to
fix.

### 5. Run the migrations

**Hosted project:** use the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <your-project-ref>
pnpm dlx supabase db push
```

Alternatively, paste the files from `supabase/migrations/` into the SQL editor, in order.

**Local development (optional, needs Docker):**

```bash
pnpm dlx supabase start
pnpm dlx supabase db reset
```

Then use the local URL and keys that `supabase start` prints.

`db reset` applies the migrations and loads `supabase/seed.sql`, which contains fictional
users, players, two matches and three teams. Magic-link emails land in Inbucket at
<http://localhost:54324>. The seed's invite code is `local-dev-code`, and `admin@example.com`
is the seeded admin.

> Don't run the seed against your real project. It creates fake users.

### 6. Look up ids and check season access

```bash
pnpm check:api
```

Leave `BARCA_TEAM_ID` and the league ids blank the first time. The script:

- looks up Barça's team id and the LaLiga, Champions League and Copa del Rey league ids, and
  prints the lines to paste into `.env.local`
- checks that `CURRENT_SEASON` returns Barça matches, with a count per competition
- prints your remaining daily quota

It uses **2 requests**, plus 1 for each id lookup still needed (5 at most). Run it again
after pasting the ids to confirm.

### 7. Run the app

```bash
pnpm dev
```

1. Open <http://localhost:3000> and sign in with the email you put in `ADMIN_EMAILS`. You're
   made an admin on sign-in.
2. Enter `INVITE_CODE` on `/join`. The first join creates the league.
3. Go to `/admin` and click **Sync fixtures**, then **Sync squads**.
4. Share the app URL and invite code with your friends.

## API budget (free plan: 100 requests/day)

Every call goes through one client,
[`src/lib/highlightly/client.ts`](src/lib/highlightly/client.ts). It adds the key header,
logs the remaining quota, caches responses in the `api_cache` table and **never retries**
after a rate-limit or quota error. There's no live polling.

| Job                  | When                             | Cost                                                                                           |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/api/sync/fixtures` | daily                            | 2 requests (Barça home + away matches, all competitions; cached 12h)                           |
| `/api/sync/squads`   | daily, for matches ≤10 days away | Up to 3 per team: its last five games (cached 1 day) + line-ups of its last 2 (cached forever) |
| `/api/sync/lineups`  | every 15 min near kickoff        | 1 per match. Empty responses aren't cached, so retrying before line-ups are out is safe.       |
| `/api/sync/stats`    | every 15 min after full time     | 2 per match (match details with events + player box score), cached forever                     |

That comes to roughly **8 requests per match**, well inside the free 100/day.

**Player pools:** Highlightly has no squad endpoint, so each team's pickable players come from
the line-ups (starters and full bench) of its last 2 matches. A player missing from both, for
example someone back from injury, appears once they're named in a line-up.

Each route accepts `Authorization: Bearer $CRON_SECRET` or a signed-in admin, plus optional
`?matchId=<id>`. Example:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.vercel.app/api/sync/fixtures
```

## Deploying to Vercel

1. Import the GitHub repo into Vercel. It detects the framework automatically.
2. Add every variable from `.env.example` under **Settings → Environment Variables**, and set
   `APP_URL` to your Vercel URL.
3. Add `https://<your-app>.vercel.app/auth/callback` to Supabase's Redirect URLs.
4. **Scheduled syncs run on GitHub Actions** ([`.github/workflows/sync.yml`](.github/workflows/sync.yml)),
   not Vercel crons (Vercel's free plan only allows daily ones). In the GitHub repo, open
   **Settings → Secrets and variables → Actions** and add:
   - a **variable** `APP_URL` with your Vercel URL, e.g. `https://cule-xi.vercel.app`
   - a **secret** `CRON_SECRET` with the same value as in Vercel

   The workflow runs line-ups and stats every 15 minutes; fixtures, squads (with form-based
   prices) and player photos daily at 05:30 UTC; and deletes unused guest accounts every 2 hours. Each job only calls Highlightly when something is due, so most runs use no requests. You
   can also run it by hand from the **Actions** tab (**Sync match data → Run workflow**).

## Project structure

```
src/
  app/                        # routes: /, /join, /matches, /matches/[id]/pick, /leaderboard, /admin, /trivia
    actions/                  # server actions (auth, league, team, admin)
    api/sync/*/route.ts       # protected sync endpoints
  features/
    fantasy/
      scoring/                # rules.ts, pure scoring engine (+ tests)
      validation/             # team validation (+ tests)
      sync/                   # fixtures / squads / lineups / stats sync, points recalculation
    trivia/                   # Culé Ten daily game: rules, lists, matching, server
  lib/
    highlightly/              # client, types, mappers, __fixtures__ (mock responses)
    wikipedia/                # player photo lookup (Wikimedia Commons) with attribution
    supabase/                 # server, admin (service role) and proxy clients
    env/                      # zod-validated env (server vs public)
supabase/
  migrations/                 # schema, RLS, save_fantasy_team RPC, bigint provider ids
  seed.sql                    # fictional local data
scripts/check-api.ts          # pnpm check:api
```

## Scripts

| Script                      | What it does                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`                  | Start the dev server                                                                   |
| `pnpm build` / `pnpm start` | Production build and serve                                                             |
| `pnpm lint`                 | ESLint                                                                                 |
| `pnpm format`               | Prettier (write); `pnpm format:check` to verify                                        |
| `pnpm typecheck`            | `tsc --noEmit`                                                                         |
| `pnpm test`                 | Vitest: scoring, validation, API client and mappers, plus migrations and RLS on PGlite |
| `pnpm check:api`            | Verify the API key, look up team/league ids, check season access (2–5 requests)        |

## Known limitations

- **Penalties saved:** Highlightly doesn't report these, so they default to 0. The admin can
  enter them on `/admin`. Own goals do come through, from the match events.
- **Goals conceded:** for outfield players this uses the team's total, because the API only
  reports goals conceded for keepers. **Clean sheets** are based on the final score.
- **Prices:** set from each player's last 3 matches (minutes, match rating, goals and assists)
  and refreshed daily. See `src/features/fantasy/pricing.ts` and the `/rules` page. Admins can
  lock a price on `/admin`. Saved teams keep the prices they paid.
- **Player photos:** Highlightly doesn't provide any, so photos come from Wikimedia Commons
  (free licences, credited in the app and on `/credits`). A photo is only used when the
  Wikipedia article is clearly the same footballer at the same club and the image file is named
  after them; otherwise initials show. Admins can set, fix or remove a photo on `/admin`.
- **Guest accounts:** guests who haven't joined a league or saved a team within 2 hours are
  deleted automatically (every 2 hours).
- **Database types:** these are hand-typed. Run
  `supabase gen types typescript --linked > src/lib/supabase/database.types.ts` to generate
  them.

## Trivia: Culé Ten

`/trivia` has a daily top-10 game: name the 10 players in today's list, with a nationality
hint per slot and 3 lives. It draws on a local repository of every Barça player, imported once
from Wikidata (free), plus managers and presidents. Lists span the club's whole history: club
records, 100+ appearance players by nation, position and era, every season's top scorer,
managers and presidents, parsed once from Wikipedia and stored. History lists that pass every
check go live automatically; the rest wait for approval on `/admin/trivia`. Current-season
lists are generated automatically.

`/trivia/grid` has **Tiki-Taka-Toe**: a daily 3×3 grid where each square needs a Barça player
who fits its row and column: another club he played for, his nationality, position or decade
at Barça. 9 guesses, a rarity score, and a table with your league-mates. Club histories are
imported once from Wikidata (`scripts/trivia-clubs.ts`, also part of the player import). See
[`src/features/trivia/README.md`](src/features/trivia/README.md).

## Roadmap

- **More trivia:** a combined trivia + fantasy leaderboard.
- Multiple leagues per user, with a league switcher on the leaderboard
- Price changes based on form
- Push or email reminders before kickoff
- Generated Supabase types

## License

[MIT](LICENSE) © Sayan Choudhury
