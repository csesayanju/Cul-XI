import type { Competition, PlayerMatchStats, Position } from "@/features/fantasy/types";

import type {
  HlBoxScoreTeam,
  HlEvent,
  HlLineupPlayer,
  HlLineups,
  HlMatch,
  HlMatchDetail,
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
}

export interface LineupEntry extends Omit<PlayerRow, "position"> {
  position: Position | null;
  lineup_status: "starting" | "bench";
}

/** `initialLineup` is documented as rows (GK first, then formation rows); accept flat too. */
function flattenLineup(lineup: HlTeamLineup["initialLineup"]): HlLineupPlayer[] {
  return (lineup as (HlLineupPlayer | HlLineupPlayer[])[]).flat();
}

export const hasLineups = (l: HlLineups | null | undefined): boolean =>
  !!l && [l.homeTeam, l.awayTeam].some((t) => t && flattenLineup(t.initialLineup).length > 0);

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
      ...flattenLineup(team.initialLineup).map(entry("starting")),
      ...(team.substitutes ?? []).map(entry("bench")),
    ];
  });
}

/**
 * Highlightly has no squad endpoint, so a team's player pool is built from the line-ups
 * (starters + full bench) of its recent matches. Most recent appearance wins.
 */
export function playerPoolFromLineups(
  lineupsNewestFirst: HlLineups[],
  teamId: number,
): PlayerRow[] {
  const pool = new Map<number, PlayerRow>();
  for (const lineups of lineupsNewestFirst) {
    for (const e of mapLineups(lineups)) {
      if (e.team_api_id !== teamId || pool.has(e.api_player_id)) continue;
      pool.set(e.api_player_id, { ...e, position: e.position ?? "MID" });
    }
  }
  return [...pool.values()];
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
    return players.map((p) => {
      const s = p.statistics?.[0] ?? {};
      const minutes = p.minutesPlayed ?? 0;
      const played = minutes > 0;
      const isKeeper = p.position === "Goalkeeper";
      return {
        api_player_id: p.id,
        name: p.name,
        team_api_id: team.id,
        position: mapPosition(p.position),
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
