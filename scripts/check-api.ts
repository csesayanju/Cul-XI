/**
 * pnpm check:api — verifies the Highlightly key, looks up the ids Culé XI needs and checks
 * that the configured season returns Barça matches. Reads .env.local (then .env).
 * Never prints the key. Requests used: 2 (matches) + 1 per id that still needs looking up.
 */
import { config } from "dotenv";

import { createHighlightlyClient, ProviderError } from "../src/lib/highlightly/client";
import { competitionFor, mapMatches } from "../src/lib/highlightly/mappers";
import type { HlLeague } from "../src/lib/highlightly/types";
import { parseEnv, providerEnvSchema } from "../src/lib/env/schema";

config({ path: [".env.local", ".env"], quiet: true });

const ok = (msg: string) => console.log(`  ✔ ${msg}`);
const warn = (msg: string) => console.log(`  ⚠ ${msg}`);
const fail = (msg: string) => console.log(`  ✖ ${msg}`);
const latestSeason = (l: HlLeague) => Math.max(...(l.seasons ?? []).map((s) => s.season), 0);

async function main() {
  const env = parseEnv(providerEnvSchema, process.env, "provider");
  const api = createHighlightlyClient({
    apiKey: env.HIGHLIGHTLY_API_KEY,
    baseUrl: env.HIGHLIGHTLY_BASE_URL,
    logger: { info: () => {}, warn: () => {} },
  });
  const suggestions: string[] = [];

  console.log("\nCulé XI · Highlightly check\n");

  // 1) Barça team id
  let barcaId = env.BARCA_TEAM_ID;
  if (barcaId == null) {
    const { data } = await api.searchTeams("Barcelona");
    const clubs = data.data.filter((t) => t.type !== "national");
    ok(`Key accepted. Teams matching "Barcelona":`);
    for (const t of clubs) console.log(`      ${t.id}  ${t.name}`);
    const best = clubs.find((t) => /^(fc )?barcelona$/i.test(t.name.trim()));
    if (best) {
      barcaId = best.id;
      suggestions.push(`BARCA_TEAM_ID=${best.id}`);
    } else {
      warn("Couldn't pick Barça automatically — copy the right id into BARCA_TEAM_ID.");
    }
  }

  // 2) League ids (LaLiga + Copa del Rey from Spain's list; Champions League by name)
  let laligaId = env.LALIGA_LEAGUE_ID;
  let copaId = env.COPA_DEL_REY_LEAGUE_ID;
  let uclId = env.UCL_LEAGUE_ID;
  if (laligaId == null || copaId == null) {
    const { data } = await api.leagues({ countryCode: "ES" });
    console.log("\n  Spanish competitions:");
    for (const l of data.data)
      console.log(`      ${l.id}  ${l.name} (latest season ${latestSeason(l)})`);
    const laliga = data.data.find((l) => /^(la ?liga|primera divisi[oó]n)$/i.test(l.name.trim()));
    const copa = data.data.find((l) => /copa del rey/i.test(l.name));
    if (laligaId == null && laliga) suggestions.push(`LALIGA_LEAGUE_ID=${(laligaId = laliga.id)}`);
    if (copaId == null && copa) suggestions.push(`COPA_DEL_REY_LEAGUE_ID=${(copaId = copa.id)}`);
  }
  if (uclId == null) {
    const { data } = await api.leagues({ leagueName: "UEFA Champions League" });
    const ucl = data.data[0];
    if (ucl) {
      console.log(
        `\n  Champions League: ${ucl.id}  ${ucl.name} (latest season ${latestSeason(ucl)})`,
      );
      suggestions.push(`UCL_LEAGUE_ID=${(uclId = ucl.id)}`);
    } else {
      warn('No league named "UEFA Champions League" found.');
    }
  }

  // 3) Barça matches for the configured season
  if (barcaId != null) {
    const { data } = await api.teamSeasonMatches(barcaId, env.CURRENT_SEASON);
    console.log("");
    if (data.length === 0) {
      fail(`No matches for team ${barcaId} in season ${env.CURRENT_SEASON}.`);
      warn("Check BARCA_TEAM_ID and CURRENT_SEASON (season = the year the season starts).");
    } else {
      ok(`${data.length} Barça matches in season ${env.CURRENT_SEASON} (all competitions)`);
      const tracked = {
        barcaTeamId: barcaId,
        laligaLeagueId: laligaId ?? -1,
        uclLeagueId: uclId ?? -1,
        copaLeagueId: copaId,
      };
      const rows = mapMatches(data, tracked);
      for (const comp of ["laliga", "ucl", "copa"] as const) {
        const n = rows.filter((r) => r.competition === comp).length;
        if (n > 0) ok(`${comp}: ${n} matches`);
        else warn(`${comp}: no matches found (league id may be wrong, or not scheduled yet)`);
      }
      const other = new Map<number, string>();
      for (const m of data)
        if (!competitionFor(m.league.id, tracked)) other.set(m.league.id, m.league.name);
      if (other.size > 0) {
        console.log("\n  Other competitions in these matches (not tracked):");
        for (const [id, name] of other) console.log(`      ${id}  ${name}`);
      }
      const next = rows.find((r) => new Date(r.kickoff_at).getTime() > Date.now());
      if (next)
        ok(
          `Next tracked match: vs ${next.opponent_name} (${next.competition}) at ${next.kickoff_at}`,
        );
    }
  }

  if (suggestions.length > 0) {
    console.log("\n  Add these to .env.local:\n");
    for (const s of suggestions) console.log(`    ${s}`);
  }
  const q = api.getQuota();
  console.log(
    `\n  Daily requests remaining: ${q.dailyRemaining ?? "unknown"}/${q.dailyLimit ?? "?"}\n`,
  );
  process.exitCode = suggestions.length > 0 ? 1 : 0;
}

main().catch((err: unknown) => {
  fail(err instanceof ProviderError ? `${err.kind}: ${err.message}` : String(err));
  process.exitCode = 1;
});
