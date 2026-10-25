/**
 * pnpm check:api — verifies the API-Football key and current-season access.
 * Makes exactly two requests: /status and /fixtures?team=<BARCA_TEAM_ID>&season=<CURRENT_SEASON>.
 * Reads .env.local (then .env). Never prints the key or account details.
 */
import { config } from "dotenv";

import { ApiFootballError, createApiFootballClient } from "../src/lib/api-football/client";
import { competitionFor, mapFixtures } from "../src/lib/api-football/mappers";
import { apiFootballEnvSchema, parseEnv } from "../src/lib/env/schema";

config({ path: [".env.local", ".env"], quiet: true });

const ok = (msg: string) => console.log(`  ✔ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠ ${msg}`);
const fail = (msg: string) => console.log(`  ✖ ${msg}`);

async function main() {
  const env = parseEnv(apiFootballEnvSchema, process.env, "API-Football");
  const quietLogger = { info: () => {}, warn: () => {} };
  const api = createApiFootballClient({
    apiKey: env.API_FOOTBALL_KEY,
    baseUrl: env.API_FOOTBALL_BASE_URL,
    logger: quietLogger,
  });

  console.log("\nCulé XI · API-Football check\n");

  // 1) Account status
  const { data: status } = await api.status();
  ok(`Key accepted. Plan: ${status.subscription.plan} (active: ${status.subscription.active})`);
  ok(`Requests today: ${status.requests.current}/${status.requests.limit_day}`);

  // 2) Barça fixtures for the configured season
  const tracked = {
    barcaTeamId: env.BARCA_TEAM_ID,
    laligaLeagueId: env.LALIGA_LEAGUE_ID,
    uclLeagueId: env.UCL_LEAGUE_ID,
    copaLeagueId: env.COPA_DEL_REY_LEAGUE_ID,
  };
  let fixtures;
  try {
    ({ data: fixtures } = await api.teamFixtures(env.BARCA_TEAM_ID, env.CURRENT_SEASON));
  } catch (err) {
    if (err instanceof ApiFootballError && err.kind === "api") {
      fail(err.message);
      warn(
        `Your plan may not cover season ${env.CURRENT_SEASON}. Free plans are often limited to ` +
          `older seasons — check the season coverage on your API-Football dashboard.`,
      );
      return finish(api.getQuota().dailyRemaining, 1);
    }
    throw err;
  }

  if (fixtures.length === 0) {
    fail(`No fixtures for team ${env.BARCA_TEAM_ID} in season ${env.CURRENT_SEASON}.`);
    warn("Check BARCA_TEAM_ID and CURRENT_SEASON (season = the year the season starts).");
    return finish(api.getQuota().dailyRemaining, 1);
  }

  const teamName =
    fixtures[0]!.teams.home.id === env.BARCA_TEAM_ID
      ? fixtures[0]!.teams.home.name
      : fixtures[0]!.teams.away.name;
  ok(
    `Team ${env.BARCA_TEAM_ID} = "${teamName}", ${fixtures.length} fixtures in ${env.CURRENT_SEASON}`,
  );

  const rows = mapFixtures(fixtures, tracked);
  for (const comp of ["laliga", "ucl", "copa"] as const) {
    const n = rows.filter((r) => r.competition === comp).length;
    if (n > 0) ok(`${comp}: ${n} fixtures`);
    else warn(`${comp}: no fixtures found (league id may be wrong, or not started yet)`);
  }

  const untracked = new Map<number, string>();
  for (const f of fixtures) {
    if (!competitionFor(f.league.id, tracked)) untracked.set(f.league.id, f.league.name);
  }
  if (untracked.size > 0) {
    console.log("\n  Other competitions in this season (not tracked):");
    for (const [id, name] of untracked) console.log(`    ${id}  ${name}`);
    if (env.COPA_DEL_REY_LEAGUE_ID == null) {
      const copa = [...untracked].find(([, name]) => /copa del rey/i.test(name));
      if (copa) warn(`Set COPA_DEL_REY_LEAGUE_ID=${copa[0]} in .env.local`);
    }
  }

  const next = rows
    .filter((r) => new Date(r.kickoff_at).getTime() > Date.now())
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))[0];
  if (next) {
    ok(`Next match: vs ${next.opponent_name} (${next.competition}) at ${next.kickoff_at}`);
  }

  return finish(api.getQuota().dailyRemaining, 0);
}

function finish(remaining: number | null, code: number) {
  console.log(`\n  Daily requests remaining: ${remaining ?? "unknown"}\n`);
  process.exitCode = code;
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
