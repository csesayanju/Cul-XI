import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { articleUrl, fetchArticleHtml } from "@/lib/wikipedia/barca-history";
import {
  DATA_PAGES,
  parseBarcaSeasons,
  parseClasicos,
  parseLigaChampions,
} from "@/lib/wikipedia/history-data";

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/**
 * One-time (re-runnable) import of Barça seasons, La Liga podiums and Clásicos from
 * Wikipedia. Raw parsed facts go to `trivia_sources` first, then typed tables are upserted by
 * natural key, so re-runs update rows in place. Aborts without writing if a page changed shape.
 */
export async function importHistory(db: SupabaseClient, log: (s: string) => void = console.log) {
  const [seasonsHtml, ligaHtml, clasicosHtml] = await Promise.all([
    fetchArticleHtml(DATA_PAGES.barcaSeasons),
    fetchArticleHtml(DATA_PAGES.ligaChampions),
    fetchArticleHtml(DATA_PAGES.clasicos),
  ]);
  const seasons = parseBarcaSeasons(seasonsHtml);
  const liga = parseLigaChampions(ligaHtml);
  const clasicos = parseClasicos(clasicosHtml);

  // Sanity thresholds: well below today's counts (97 / 98 / 265), far above a broken parse.
  if (seasons.length < 90 || liga.length < 90 || clasicos.length < 240) {
    throw new Error(
      `Wikipedia pages didn't parse as expected (${seasons.length} seasons, ${liga.length} ` +
        `league seasons, ${clasicos.length} Clásicos), so nothing was changed.`,
    );
  }
  if (seasons.some((s) => s.won + s.drawn + s.lost !== s.played)) {
    throw new Error("A season's W/D/L doesn't add up to games played; nothing was changed.");
  }

  const fetchedAt = new Date().toISOString();
  check(
    await db.from("trivia_sources").upsert(
      [
        ["history:barca-seasons", DATA_PAGES.barcaSeasons, seasons],
        ["history:liga-champions", DATA_PAGES.ligaChampions, liga],
        ["history:clasicos", DATA_PAGES.clasicos, clasicos],
      ].map(([key, title, data]) => ({
        key,
        title,
        url: articleUrl(title as string),
        data,
        fetched_at: fetchedAt,
      })),
      { onConflict: "key" },
    ),
    "save sources",
  );

  const latest = Math.max(...seasons.map((s) => s.startYear));
  check(
    await db.from("barca_seasons").upsert(
      seasons.map((s) => ({
        start_year: s.startYear,
        season: s.season,
        division: s.division,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        goals_for: s.goalsFor,
        goals_against: s.goalsAgainst,
        points: s.points,
        position: s.position,
        copa: s.copa,
        europe: s.europe,
        others: s.others,
        top_scorers: s.topScorers,
        top_scorer_goals: s.topScorerGoals,
        // The newest season is still being played.
        complete: s.startYear < latest,
        fetched_at: fetchedAt,
      })),
      { onConflict: "start_year" },
    ),
    "save Barça seasons",
  );
  check(
    await db.from("liga_seasons").upsert(
      liga.map((s) => ({
        start_year: s.startYear,
        season: s.season,
        champion: s.champion,
        champion_points: s.championPoints,
        runner_up: s.runnerUp,
        runner_up_points: s.runnerUpPoints,
        third: s.third,
        third_points: s.thirdPoints,
        top_scorers: s.topScorers,
        top_scorer_clubs: s.topScorerClubs,
        top_scorer_goals: s.topScorerGoals,
        fetched_at: fetchedAt,
      })),
      { onConflict: "start_year" },
    ),
    "save La Liga seasons",
  );
  check(
    await db.from("clasicos").upsert(
      clasicos.map((c) => ({
        key: c.key,
        competition: c.competition,
        season: c.season,
        start_year: c.startYear,
        played_on: c.date,
        round: c.round,
        home: c.home,
        home_goals: c.homeGoals,
        away_goals: c.awayGoals,
        note: c.note,
        home_scorers: c.homeScorers,
        away_scorers: c.awayScorers,
        fetched_at: fetchedAt,
      })),
      { onConflict: "key" },
    ),
    "save Clásicos",
  );

  const message =
    `History: ${seasons.length} Barça seasons, ${liga.length} La Liga seasons, ` +
    `${clasicos.length} Clásicos.`;
  log(message);
  return message;
}
