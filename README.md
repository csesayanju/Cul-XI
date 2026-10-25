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
- **Data:** [API-Football](https://www.api-football.com/), via the direct API rather than
  RapidAPI. It's called only from server code.
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

### 3. Get an API-Football key

Sign up at [dashboard.api-football.com](https://dashboard.api-football.com/) and copy your API
key. Use the direct API, not RapidAPI.

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

### 6. Check your API key and season access

```bash
pnpm check:api
```

This makes **2 requests**. It confirms the key works, checks that `BARCA_TEAM_ID` and
`CURRENT_SEASON` return fixtures, lists the fixture count for each competition, suggests
`COPA_DEL_REY_LEAGUE_ID` if it finds the Copa in Barça's fixtures, and prints your remaining
daily quota. If it reports no access to the season, your plan may not cover it. Check season
coverage on your API-Football dashboard.

### 7. Run the app

```bash
pnpm dev
```

1. Open <http://localhost:3000> and sign in with the email you put in `ADMIN_EMAILS`. You're
   made an admin on sign-in.
2. Enter `INVITE_CODE` on `/join`. The first join creates the league.
3. Go to `/admin` and click **Sync fixtures**, then **Sync squads**.
4. Share the app URL and invite code with your friends.

## API budget (free plan: ~100 requests/day, 10/minute)

Every call goes through one client,
[`src/lib/api-football/client.ts`](src/lib/api-football/client.ts). It adds the key header,
logs the remaining quota, caches responses in the `api_cache` table and **never retries**
after a rate-limit or quota error. There's no live polling.

| Job                  | When                             | Cost                                                                                     |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `/api/sync/fixtures` | daily                            | 1 request (all competitions at once; cached 12h)                                         |
| `/api/sync/squads`   | daily, for matches ≤10 days away | 1 for the opponent, plus Barça once a week (cached 7 days)                               |
| `/api/sync/lineups`  | ~1h before kickoff               | 1 per match. Empty responses aren't cached, so retrying before line-ups are out is safe. |
| `/api/sync/stats`    | after full time                  | 1–2 per match (status refresh plus player stats), cached forever                         |

That comes to roughly **5 requests per match**.

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
4. [`vercel.json`](vercel.json) schedules daily crons for stats (05:00 UTC), fixtures (06:00)
   and squads (06:30). Vercel sends `CRON_SECRET` automatically.

> **Line-ups:** Vercel's Hobby plan only allows daily crons, so line-ups aren't scheduled.
> You can click **Sync line-ups** on `/admin` before kickoff, or point an external scheduler
> (for example cron-job.org) at `/api/sync/lineups` with the bearer header. Line-ups only add
> "Starting" and "Bench" tags, and scoring works without them.

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
    trivia/                   # reserved for the trivia module
  lib/
    api-football/             # client, types, mappers, __fixtures__ (mock responses)
    supabase/                 # server, admin (service role) and proxy clients
    env/                      # zod-validated env (server vs public)
supabase/
  migrations/                 # schema, RLS, save_fantasy_team RPC
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
| `pnpm check:api`            | Verify the API key and season access (2 requests)                                      |

## Known limitations

- **Own goals:** these aren't in `/fixtures/players`, so they default to 0. The admin can
  enter them on `/admin`.
- **Goals conceded:** for outfield players this uses the team's total, because the API only
  reports goals conceded for keepers. **Clean sheets** are based on the final score.
- **Prices:** default prices depend only on position, with a +1 premium for Barça players (see
  `src/features/fantasy/pricing.ts`). The admin can edit them. Saved teams keep the prices
  they paid.
- **Database types:** these are hand-typed. Run
  `supabase gen types typescript --linked > src/lib/supabase/database.types.ts` to generate
  them.

## Roadmap

- **Trivia module:** Barça quizzes for the group, with their own points and a combined
  leaderboard. The structure is reserved in
  [`src/features/trivia/`](src/features/trivia/README.md).
- Multiple leagues per user, with a league switcher on the leaderboard
- Price changes based on form
- Push or email reminders before kickoff
- Generated Supabase types

## License

[MIT](LICENSE) © Sayan Choudhury
