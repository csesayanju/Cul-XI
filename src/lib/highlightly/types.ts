/**
 * Typed subsets of Highlightly Football API responses
 * (https://highlightly.net/football-api/documentation/). Only fields Culé XI reads are typed.
 */

export type HlMatchState =
  | "To be announced"
  | "Not started"
  | "First half"
  | "Half time"
  | "Second half"
  | "Extra time"
  | "Break time"
  | "Penalties"
  | "Suspended"
  | "Interrupted"
  | "Finished"
  | "Finished after penalties"
  | "Finished after extra time"
  | "Postponed"
  | "Cancelled"
  | "Abandoned"
  | "Awarded"
  | "In progress"
  | "Unknown";

export type HlPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export interface HlPagination {
  totalCount: number;
  offset: number;
  limit: number;
}

/** List endpoints wrap results like this. */
export interface HlPage<T> {
  data: T[];
  pagination: HlPagination;
  plan?: { tier: string; message: string };
}

export interface HlTeamRef {
  id: number;
  name: string;
  logo?: string;
  type?: "club" | "national";
}

export interface HlLeagueRef {
  id: number;
  season: number;
  name: string;
  logo?: string;
}

// --- GET /matches, /last-five-games ------------------------------------------
export interface HlMatch {
  id: number;
  round: string | null;
  date: string;
  country?: { code: string; name: string };
  homeTeam: HlTeamRef;
  awayTeam: HlTeamRef;
  league: HlLeagueRef;
  state: {
    description: HlMatchState;
    clock: number | null;
    /** e.g. "2 - 1" (home - away); empty/null before kickoff. */
    score: { current: string | null; penalties: string | null };
  };
}

// --- GET /matches/{id} (returns an array with one item) ----------------------
export type HlEventType =
  | "Goal"
  | "Own Goal"
  | "Penalty"
  | "Missed Penalty"
  | "Yellow Card"
  | "Red Card"
  | "Substitution"
  | "VAR Goal Confirmed"
  | "VAR Goal Cancelled"
  | "VAR Penalty"
  | "VAR Penalty Cancelled"
  | "VAR Goal Cancelled - Offside";

export interface HlEvent {
  team: HlTeamRef;
  time: string;
  type: HlEventType;
  playerId: number | null;
  player: string | null;
  assistingPlayerId: number | null;
  assist: string | null;
  substituted: string | null;
}

export interface HlMatchDetail extends HlMatch {
  venue?: { name: string | null; city: string | null } | null;
  events?: HlEvent[];
}

// --- GET /lineups/{matchId} --------------------------------------------------
export interface HlLineupPlayer {
  id: number;
  name: string;
  number: number | null;
  position: HlPosition | null;
}

export interface HlTeamLineup {
  id: number;
  name: string;
  formation: string | null;
  initialLineup: HlLineupPlayer[][] | HlLineupPlayer[];
  substitutes: HlLineupPlayer[];
}

export interface HlLineups {
  homeTeam: HlTeamLineup | null;
  awayTeam: HlTeamLineup | null;
}

// --- GET /box-score/{matchId} ------------------------------------------------
export interface HlBoxScoreStatistics {
  goalsScored?: number | null;
  goalsSaved?: number | null;
  goalsConceded?: number | null;
  assists?: number | null;
  cardsRed?: number | null;
  cardsYellow?: number | null;
  cardsSecondYellow?: number | null;
  penaltiesMissed?: number | null;
}

export interface HlBoxScorePlayer {
  id: number;
  name: string;
  fullName?: string;
  shirtNumber: number | null;
  position: HlPosition | null;
  minutesPlayed: number | null;
  isSubstitute: boolean;
  statistics: HlBoxScoreStatistics[];
}

export interface HlBoxScoreTeam {
  team: HlTeamRef;
  players: HlBoxScorePlayer[];
}

// --- GET /teams, /leagues ----------------------------------------------------
export interface HlLeague {
  id: number;
  name: string;
  country: { code: string; name: string };
  seasons: { season: number }[];
}
