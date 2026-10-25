import type { Competition, PlayerMatchStats, Position } from "@/features/fantasy/types";

import type {
  ApiFixture,
  ApiFixturePlayers,
  ApiLineup,
  ApiSquad,
  ApiSquadPosition,
  FixtureStatusShort,
} from "./types";

/** Pure functions that turn API-Football payloads into rows for our tables. */

export const FINISHED_STATUSES: readonly FixtureStatusShort[] = ["FT", "AET", "PEN", "AWD", "WO"];
export const CANCELLED_STATUSES: readonly FixtureStatusShort[] = ["PST", "CANC", "ABD"];

export const isFinished = (status: string) =>
  (FINISHED_STATUSES as readonly string[]).includes(status);

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
  venue: string | null;
  kickoff_at: string;
  status: string;
  barca_goals: number | null;
  opponent_goals: number | null;
}

/** Keeps only Barça fixtures in tracked competitions (drops friendlies etc.). */
export function mapFixtures(fixtures: ApiFixture[], cfg: TrackedLeagues): MatchRow[] {
  const rows: MatchRow[] = [];
  for (const f of fixtures) {
    const competition = competitionFor(f.league.id, cfg);
    if (!competition) continue;

    const isHome = f.teams.home.id === cfg.barcaTeamId;
    if (!isHome && f.teams.away.id !== cfg.barcaTeamId) continue;
    const opponent = isHome ? f.teams.away : f.teams.home;

    rows.push({
      api_fixture_id: f.fixture.id,
      competition,
      api_league_id: f.league.id,
      season: f.league.season,
      round: f.league.round ?? null,
      opponent_team_id: opponent.id,
      opponent_name: opponent.name,
      is_home: isHome,
      venue: f.fixture.venue.name,
      kickoff_at: new Date(f.fixture.timestamp * 1000).toISOString(),
      status: f.fixture.status.short,
      barca_goals: isHome ? f.goals.home : f.goals.away,
      opponent_goals: isHome ? f.goals.away : f.goals.home,
    });
  }
  return rows;
}

const SQUAD_POSITIONS: Record<ApiSquadPosition, Position> = {
  Goalkeeper: "GK",
  Defender: "DEF",
  Midfielder: "MID",
  Attacker: "FWD",
};

const SHORT_POSITIONS: Record<"G" | "D" | "M" | "F", Position> = {
  G: "GK",
  D: "DEF",
  M: "MID",
  F: "FWD",
};

export const mapSquadPosition = (pos: ApiSquadPosition): Position => SQUAD_POSITIONS[pos];
export const mapShortPosition = (pos: "G" | "D" | "M" | "F" | null): Position | null =>
  pos ? SHORT_POSITIONS[pos] : null;

export interface PlayerRow {
  api_player_id: number;
  name: string;
  team_api_id: number;
  team_name: string;
  position: Position;
  shirt_number: number | null;
}

export function mapSquad(squads: ApiSquad[]): PlayerRow[] {
  return squads.flatMap((s) =>
    s.players.map((p) => ({
      api_player_id: p.id,
      name: p.name,
      team_api_id: s.team.id,
      team_name: s.team.name,
      position: mapSquadPosition(p.position),
      shirt_number: p.number,
    })),
  );
}

export interface LineupEntry {
  api_player_id: number;
  name: string;
  team_api_id: number;
  team_name: string;
  position: Position | null;
  shirt_number: number | null;
  lineup_status: "starting" | "bench";
}

export function mapLineups(lineups: ApiLineup[]): LineupEntry[] {
  return lineups.flatMap((l) => {
    const entry =
      (status: LineupEntry["lineup_status"]) =>
      ({ player }: ApiLineup["startXI"][number]): LineupEntry => ({
        api_player_id: player.id,
        name: player.name,
        team_api_id: l.team.id,
        team_name: l.team.name,
        position: mapShortPosition(player.pos),
        shirt_number: player.number,
        lineup_status: status,
      });
    return [...l.startXI.map(entry("starting")), ...l.substitutes.map(entry("bench"))];
  });
}

export interface StatsEntry {
  api_player_id: number;
  name: string;
  team_api_id: number;
  stats: PlayerMatchStats;
}

/**
 * Maps /fixtures/players to stat lines.
 * Known API gaps (admins can correct these on /admin):
 *  - clean sheet is derived from the final score (team conceded 0);
 *  - outfield players' goals conceded uses the team total (API only fills it for keepers);
 *  - own goals are not in this endpoint, so they default to 0.
 */
export function mapFixturePlayerStats(
  data: ApiFixturePlayers[],
  score: { barcaTeamId: number; barcaGoals: number; opponentGoals: number },
): StatsEntry[] {
  return data.flatMap((team) => {
    const teamConceded =
      team.team.id === score.barcaTeamId ? score.opponentGoals : score.barcaGoals;

    return team.players.map(({ player, statistics }) => {
      const s = statistics[0];
      const minutes = s?.games.minutes ?? 0;
      const isKeeper = s?.games.position === "G";
      return {
        api_player_id: player.id,
        name: player.name,
        team_api_id: team.team.id,
        stats: {
          minutes,
          goals: s?.goals.total ?? 0,
          assists: s?.goals.assists ?? 0,
          cleanSheet: minutes > 0 && teamConceded === 0,
          saves: s?.goals.saves ?? 0,
          goalsConceded:
            minutes > 0 ? (isKeeper ? (s?.goals.conceded ?? teamConceded) : teamConceded) : 0,
          yellowCards: Math.min(s?.cards.yellow ?? 0, 2),
          redCards: Math.min(s?.cards.red ?? 0, 1),
          penaltiesMissed: s?.penalty.missed ?? 0,
          penaltiesSaved: s?.penalty.saved ?? 0,
          ownGoals: 0,
        },
      };
    });
  });
}
