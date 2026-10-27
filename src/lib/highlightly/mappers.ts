import type { Injury } from "@/features/fantasy/availability";
import {
  EMPTY_FORM,
  type FantasyForm,
  type PlayerForm,
  type SeasonStats,
} from "@/features/fantasy/pricing";
import { calculatePlayerPoints } from "@/features/fantasy/scoring/calculate";
import type { Competition, PlayerMatchStats, Position } from "@/features/fantasy/types";

import type {
  HlBoxScorePlayer,
  HlBoxScoreStatistics,
  HlBoxScoreTeam,
  HlEvent,
  HlLineupPlayer,
  HlLineups,
  HlMatch,
  HlMatchDetail,
  HlCompetitionStats,
  HlInjury,
  HlMarketValue,
  HlMatchState,
  HlPosition,
  HlTeamLineup,
} from "./types";

/** Pure functions that turn Highlightly payloads into rows for our tables. */

/**
 * We store compact status codes in `matches.status` (independent of the data provider).
 */
const STATUS_CODES: Record<HlMatchState, string> = {
  "To be announced": "TBD",
  "Not started": "NS",
  "First half": "1H",
  "Half time": "HT",
  "Second half": "2H",
  "Extra time": "ET",
  "Break time": "BT",
  Penalties: "P",
  Suspended: "SUSP",
  Interrupted: "INT",
  Finished: "FT",
  "Finished after penalties": "PEN",
  "Finished after extra time": "AET",
  Postponed: "PST",
  Cancelled: "CANC",
  Abandoned: "ABD",
  Awarded: "AWD",
  "In progress": "LIVE",
  Unknown: "TBD",
};

export const statusCode = (state: string): string => STATUS_CODES[state as HlMatchState] ?? "TBD";

export const FINISHED_STATUSES: readonly string[] = ["FT", "AET", "PEN", "AWD"];
export const CANCELLED_STATUSES: readonly string[] = ["PST", "CANC", "ABD"];
export const isFinished = (status: string) => FINISHED_STATUSES.includes(status);

/** Parses "2 - 1" (home - away). Returns null before kickoff or if unparseable. */
export function parseScore(
  score: string | null | undefined,
): { home: number; away: number } | null {
  const m = score?.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

export interface TrackedLeagues {
  barcaTeamId: number;
  laligaLeagueId: number;
  uclLeagueId: number;
  copaLeagueId?: number;
}

export function competitionFor(leagueId: number, cfg: TrackedLeagues): Competition | null {
  if (leagueId === cfg.laligaLeagueId) return "laliga";
  if (leagueId === cfg.uclLeagueId) return "ucl";
  if (cfg.copaLeagueId != null && leagueId === cfg.copaLeagueId) return "copa";
  return null;
}

export interface MatchRow {
  api_fixture_id: number;
  competition: Competition;
  api_league_id: number;
  season: number;
  round: string | null;
  opponent_team_id: number;
  opponent_name: string;
  is_home: boolean;
  kickoff_at: string;
  status: string;
  barca_goals: number | null;
  opponent_goals: number | null;
}

/** Keeps only Barça matches in tracked competitions (drops friendlies etc.), de-duplicated. */
export function mapMatches(matches: HlMatch[], cfg: TrackedLeagues): MatchRow[] {
  const rows = new Map<number, MatchRow>();
  for (const m of matches) {
    const competition = competitionFor(m.league.id, cfg);
    if (!competition) continue;

    const isHome = m.homeTeam.id === cfg.barcaTeamId;
    if (!isHome && m.awayTeam.id !== cfg.barcaTeamId) continue;
    const opponent = isHome ? m.awayTeam : m.homeTeam;
    const score = parseScore(m.state.score?.current);

    rows.set(m.id, {
      api_fixture_id: m.id,
      competition,
      api_league_id: m.league.id,
      season: m.league.season,
      round: m.round ?? null,
      opponent_team_id: opponent.id,
      opponent_name: opponent.name,
      is_home: isHome,
      kickoff_at: new Date(m.date).toISOString(),
      status: statusCode(m.state.description),
      barca_goals: score ? (isHome ? score.home : score.away) : null,
      opponent_goals: score ? (isHome ? score.away : score.home) : null,
    });
  }
  return [...rows.values()].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
}

/** Status/score/venue update from GET /matches/{id}. */
export function mapMatchDetail(detail: HlMatchDetail, barcaTeamId: number) {
  const isHome = detail.homeTeam.id === barcaTeamId;
  const score = parseScore(detail.state.score?.current);
  return {
    status: statusCode(detail.state.description),
    kickoff_at: new Date(detail.date).toISOString(),
    venue: detail.venue?.name ?? null,
    barca_goals: score ? (isHome ? score.home : score.away) : null,
    opponent_goals: score ? (isHome ? score.away : score.home) : null,
  };
}

const POSITIONS: Record<HlPosition, Position> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Forward: "FWD",
};

export const mapPosition = (pos: HlPosition | null | undefined): Position | null =>
  pos ? (POSITIONS[pos] ?? null) : null;

export interface PlayerRow {
  api_player_id: number;
  name: string;
  team_api_id: number;
  team_name: string;
  position: Position;
  shirt_number: number | null;
  /** Only set when known; never overwrites a stored photo with null. */
  photo_url?: string | null;
  /** Full registered name, when the box score provides it (helps photo lookups). */
  full_name?: string | null;
  /** Last-30-days form, set by the squad sync; drives automatic pricing. */
  form?: PlayerForm;
  /** The team's most recent match (matches = 1). */
  last_match?: PlayerForm;
  /** Culé XI points over the team's recent matches. */
  fantasy_form?: FantasyForm;
}

export interface LineupEntry extends Omit<
  PlayerRow,
  "position" | "photo_url" | "form" | "full_name" | "last_match" | "fantasy_form"
> {
  position: Position | null;
  lineup_status: "starting" | "bench";
}

/** `initialLineup` is documented as rows (GK first, then formation rows); accept flat too. */
function flattenLineup(lineup: HlTeamLineup["initialLineup"]): HlLineupPlayer[] {
  return (lineup as (HlLineupPlayer | HlLineupPlayer[])[]).flat();
}

export const hasLineups = (l: HlLineups | null | undefined): boolean =>
  !!l && [l.homeTeam, l.awayTeam].some((t) => t && flattenLineup(t.initialLineup).length > 0);

/** Highlightly occasionally lists players without an id (e.g. in older line-ups): skip them. */
const hasPlayerId = (p: { id?: number | null }): p is { id: number } =>
  typeof p.id === "number" && Number.isFinite(p.id) && p.id > 0;

export function mapLineups(lineups: HlLineups): LineupEntry[] {
  return [lineups.homeTeam, lineups.awayTeam].flatMap((team) => {
    if (!team) return [];
    const entry =
      (status: LineupEntry["lineup_status"]) =>
      (p: HlLineupPlayer): LineupEntry => ({
        api_player_id: p.id,
        name: p.name,
        team_api_id: team.id,
        team_name: team.name,
        position: mapPosition(p.position),
        shirt_number: p.number ?? null,
        lineup_status: status,
      });
    return [
      ...flattenLineup(team.initialLineup).filter(hasPlayerId).map(entry("starting")),
      ...(team.substitutes ?? []).filter(hasPlayerId).map(entry("bench")),
    ];
  });
}

/** Strips line-up-only fields so the row matches the `players` table. */
export const toPlayerRow = (e: LineupEntry | PlayerRow): PlayerRow => ({
  api_player_id: e.api_player_id,
  name: e.name,
  team_api_id: e.team_api_id,
  team_name: e.team_name,
  position: e.position ?? "MID",
  shirt_number: e.shirt_number,
  ...("photo_url" in e && e.photo_url ? { photo_url: e.photo_url } : {}),
  ...("full_name" in e && e.full_name ? { full_name: e.full_name } : {}),
  ...("form" in e && e.form ? { form: e.form } : {}),
  ...("last_match" in e && e.last_match ? { last_match: e.last_match } : {}),
  ...("fantasy_form" in e && e.fantasy_form ? { fantasy_form: e.fantasy_form } : {}),
});

/** Box-score stats come back as an object from the live API but an array in the spec: accept both. */
export function boxStats(p: HlBoxScorePlayer): HlBoxScoreStatistics {
  const s = p.statistics;
  return (Array.isArray(s) ? s[0] : s) ?? {};
}

const parseRating = (r: string | null | undefined): number | null => {
  const n = r == null ? NaN : Number.parseFloat(r);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export interface RecentPlayer {
  form: PlayerForm;
  photoUrl: string | null;
  name: string;
  fullName: string | null;
  position: Position | null;
  shirtNumber: number | null;
}

/**
 * Summarises one team's players over its recent box scores (newest first): appearances,
 * starts, minutes, goals, assists and average match rating, plus the latest photo.
 * `form.matches` is the number of box scores looked at, for every player.
 */
export function recentFormFromBoxScores(
  boxScoresNewestFirst: HlBoxScoreTeam[][],
  teamId: number,
): Map<number, RecentPlayer> {
  const matches = boxScoresNewestFirst.length;
  const out = new Map<number, RecentPlayer & { ratings: number[] }>();

  for (const boxScore of boxScoresNewestFirst) {
    const side = boxScore.find((t) => t.team.id === teamId);
    for (const p of (side?.players ?? []).filter(hasPlayerId)) {
      const entry = out.get(p.id) ?? {
        form: { ...EMPTY_FORM, matches },
        photoUrl: null,
        name: p.name,
        fullName: p.fullName || null,
        position: mapPosition(p.position),
        shirtNumber: p.shirtNumber ?? null,
        ratings: [],
      };
      const minutes = p.minutesPlayed ?? 0;
      const s = boxStats(p);
      if (minutes > 0) {
        entry.form.apps += 1;
        if (!p.isSubstitute) entry.form.starts += 1;
        entry.form.minutes += minutes;
        entry.form.goals += s.goalsScored ?? 0;
        entry.form.assists += s.assists ?? 0;
        const rating = parseRating(p.matchRating);
        if (rating != null) entry.ratings.push(rating);
      }
      // Newest first, so the first photo seen is the most recent one.
      entry.photoUrl ??= p.logo || null;
      out.set(p.id, entry);
    }
  }

  return new Map(
    [...out].map(([id, { ratings, ...rest }]) => [
      id,
      {
        ...rest,
        form: {
          ...rest.form,
          avgRating: ratings.length
            ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100
            : null,
        },
      },
    ]),
  );
}

/**
 * Highlightly has no squad endpoint, so a team's player pool is built from the line-ups
 * (starters + full bench) of its recent matches, enriched with recent form and photos from
 * the same matches' box scores. Most recent appearance wins. Every pool player gets a form
 * (zero appearances if they never got on the pitch), so prices reflect bench players too.
 */
export function playerPoolFromLineups(
  lineupsNewestFirst: HlLineups[],
  teamId: number,
  recent: Map<number, RecentPlayer> = new Map(),
  matchesLookedAt = lineupsNewestFirst.length,
  /** Form in the team's most recent match (see formWindows); omitted = unknown. */
  last?: Map<number, RecentPlayer>,
  /** Culé XI points over recent matches (see fantasyFormFromBoxScores); omitted = unknown. */
  fantasy?: { byPlayer: Map<number, FantasyForm>; matches: number },
): PlayerRow[] {
  const fantasyOf = (id: number): FantasyForm | undefined =>
    fantasy && fantasy.matches > 0
      ? (fantasy.byPlayer.get(id) ?? { matches: fantasy.matches, points: 0 })
      : undefined;
  const lastOf = (id: number): PlayerForm | undefined =>
    last && last.size > 0 ? (last.get(id)?.form ?? { ...EMPTY_FORM, matches: 1 }) : undefined;
  const pool = new Map<number, PlayerRow>();
  for (const lineups of lineupsNewestFirst) {
    for (const e of mapLineups(lineups)) {
      if (e.team_api_id !== teamId || pool.has(e.api_player_id)) continue;
      const r = recent.get(e.api_player_id);
      pool.set(
        e.api_player_id,
        toPlayerRow({
          ...toPlayerRow(e),
          position: e.position ?? r?.position ?? "MID",
          photo_url: r?.photoUrl ?? null,
          full_name: r?.fullName ?? null,
          form: r?.form ?? { ...EMPTY_FORM, matches: matchesLookedAt },
          last_match: lastOf(e.api_player_id),
          fantasy_form: fantasyOf(e.api_player_id),
        }),
      );
    }
  }
  // Players who played (per the box scores) but aren't in a line-up we have — rare.
  const teamName = [...pool.values()][0]?.team_name ?? "";
  for (const [id, r] of recent) {
    if (pool.has(id) || r.form.apps === 0) continue;
    pool.set(
      id,
      toPlayerRow({
        api_player_id: id,
        name: r.name,
        team_api_id: teamId,
        team_name: teamName,
        position: r.position ?? "MID",
        shirt_number: r.shirtNumber,
        photo_url: r.photoUrl,
        full_name: r.fullName,
        form: r.form,
        last_match: lastOf(id),
        fantasy_form: fantasyOf(id),
      }),
    );
  }
  return [...pool.values()];
}

const parseDmy = (d: string | null | undefined): number => {
  const m = d?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : NaN;
};

/** Most recent market value in the history (by recorded date), or null. */
export function latestMarketValue(history: HlMarketValue[] | null | undefined): number | null {
  let best: { at: number; value: number } | null = null;
  for (const h of history ?? []) {
    if (h.value == null || h.value <= 0) continue;
    const at = parseDmy(h.recordedDate);
    if (!Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { at, value: h.value };
  }
  return best?.value ?? null;
}

/** "dd.mm.yyyy" or "dd/mm/yyyy" -> "yyyy-mm-dd" (or null). */
export function isoFromDmy(d: string | null | undefined): string | null {
  const m = d?.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  return m ? `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}` : null;
}

/**
 * The injury the player has right now (started on/before today, no return date yet or a
 * return date today or later), or null. If several overlap, the most recent start wins.
 */
export function currentInjury(
  injuries: HlInjury[] | null | undefined,
  now = new Date(),
): Injury | null {
  const today = now.toISOString().slice(0, 10);
  let best: Injury | null = null;
  for (const i of injuries ?? []) {
    const from = isoFromDmy(i.fromDate);
    const until = isoFromDmy(i.toDate);
    if (!from || from > today) continue;
    if (until && until < today) continue;
    if (!best || (best.from ?? "") < from) {
      best = { reason: (i.reason ?? "").trim() || "Unknown", from, until };
    }
  }
  return best;
}

/** Highlightly's season label for a season starting in `year`: 2026 -> "26/27". */
export const seasonLabel = (year: number) =>
  `${String(year % 100).padStart(2, "0")}/${String((year + 1) % 100).padStart(2, "0")}`;

/** Sums a player's stats across all competitions (and clubs) for one season. */
export function seasonStatsFrom(
  perCompetition: HlCompetitionStats[] | null | undefined,
  season: string,
): Omit<SeasonStats, "teamGames"> | null {
  const rows = (perCompetition ?? []).filter((c) => c.season === season);
  if (rows.length === 0) return null;
  const sum = (k: keyof HlCompetitionStats) =>
    rows.reduce((total, r) => total + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  return {
    season,
    games: sum("gamesPlayed"),
    minutes: sum("minutesPlayed"),
    goals: sum("goals"),
    assists: sum("assists"),
    cleanSheets: sum("cleanSheets"),
  };
}

export interface DatedBoxScore {
  /** ISO kickoff time of the match. */
  date: string;
  boxScore: HlBoxScoreTeam[];
  /** The match itself (teams + final score), needed to score clean sheets / goals conceded. */
  match?: HlMatch;
}

/**
 * Culé XI points each of a team's players scored over its recent matches, using the app's
 * own scoring rules on the box scores. Every match counts for every player (a missed match
 * scores 0), so availability matters. Matches without a final score are skipped.
 * Penalties saved and own goals aren't in box scores, so they don't count here.
 */
export function fantasyFormFromBoxScores(
  recent: DatedBoxScore[],
  teamId: number,
): { byPlayer: Map<number, FantasyForm>; matches: number } {
  const scored = recent.filter((r) => r.match && parseScore(r.match.state.score?.current));
  const byPlayer = new Map<number, FantasyForm>();
  for (const { boxScore, match } of scored) {
    const score = parseScore(match!.state.score?.current)!;
    const isHome = match!.homeTeam.id === teamId;
    const entries = mapBoxScore(boxScore, {
      barcaTeamId: teamId,
      barcaGoals: isHome ? score.home : score.away,
      opponentGoals: isHome ? score.away : score.home,
    }).filter((e) => e.team_api_id === teamId);
    for (const e of entries) {
      const points = calculatePlayerPoints(e.stats, e.position ?? "MID").points;
      const prev = byPlayer.get(e.api_player_id);
      byPlayer.set(e.api_player_id, { matches: 0, points: (prev?.points ?? 0) + points });
    }
  }
  for (const f of byPlayer.values()) f.matches = scored.length;
  return { byPlayer, matches: scored.length };
}

/**
 * Splits a team's recent box scores (any order) into the two form windows used for pricing:
 *  - month: matches in the last 30 days (falls back to the latest 2 if there were none,
 *    e.g. after an international break);
 *  - last: the team's most recent match only.
 */
export function formWindows(
  recent: DatedBoxScore[],
  teamId: number,
  now = new Date(),
): { month: Map<number, RecentPlayer>; last: Map<number, RecentPlayer> } {
  const newestFirst = [...recent].sort((a, b) => b.date.localeCompare(a.date));
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  let inMonth = newestFirst.filter((m) => Date.parse(m.date) >= cutoff);
  if (inMonth.length === 0) inMonth = newestFirst.slice(0, 2);
  return {
    month: recentFormFromBoxScores(
      inMonth.map((m) => m.boxScore),
      teamId,
    ),
    last: recentFormFromBoxScores(
      newestFirst.slice(0, 1).map((m) => m.boxScore),
      teamId,
    ),
  };
}

/** The `n` most recent finished matches, newest first. */
export function recentFinished(matches: HlMatch[], n: number): HlMatch[] {
  return matches
    .filter((m) => isFinished(statusCode(m.state.description)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

export interface StatsEntry {
  api_player_id: number;
  name: string;
  team_api_id: number;
  position: Position | null;
  photoUrl: string | null;
  stats: PlayerMatchStats;
}

/**
 * Maps /box-score (+ events for own goals) to stat lines.
 * Known gaps (admins can correct these on /admin):
 *  - penalties saved are not provided, so they default to 0;
 *  - outfield players' goals conceded uses the team total (the API only fills it for keepers);
 *  - clean sheet is derived from the final score (team conceded 0).
 */
export function mapBoxScore(
  boxScore: HlBoxScoreTeam[],
  ctx: { barcaTeamId: number; barcaGoals: number; opponentGoals: number; events?: HlEvent[] },
): StatsEntry[] {
  const ownGoals = new Map<number, number>();
  for (const e of ctx.events ?? []) {
    if (e.type === "Own Goal" && e.playerId != null) {
      ownGoals.set(e.playerId, (ownGoals.get(e.playerId) ?? 0) + 1);
    }
  }

  return boxScore.flatMap(({ team, players }) => {
    const teamConceded = team.id === ctx.barcaTeamId ? ctx.opponentGoals : ctx.barcaGoals;
    return players.filter(hasPlayerId).map((p) => {
      const s = boxStats(p);
      const minutes = p.minutesPlayed ?? 0;
      const played = minutes > 0;
      const isKeeper = p.position === "Goalkeeper";
      return {
        api_player_id: p.id,
        name: p.name,
        team_api_id: team.id,
        position: mapPosition(p.position),
        photoUrl: p.logo || null,
        stats: {
          minutes,
          goals: s.goalsScored ?? 0,
          assists: s.assists ?? 0,
          cleanSheet: played && teamConceded === 0,
          saves: s.goalsSaved ?? 0,
          goalsConceded: played ? (isKeeper ? (s.goalsConceded ?? teamConceded) : teamConceded) : 0,
          yellowCards: Math.min(s.cardsYellow ?? 0, 2),
          redCards: Math.min((s.cardsRed ?? 0) + (s.cardsSecondYellow ?? 0), 1),
          penaltiesMissed: s.penaltiesMissed ?? 0,
          penaltiesSaved: 0,
          ownGoals: ownGoals.get(p.id) ?? 0,
        },
      };
    });
  });
}
