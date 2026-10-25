/**
 * Typed subsets of API-Football v3 responses (https://www.api-football.com/documentation-v3).
 * Only fields Culé XI reads are typed; the API returns more.
 */

/** Every endpoint wraps its payload in this envelope. */
export interface ApiFootballEnvelope<T> {
  get: string;
  parameters: Record<string, string>;
  /** `[]` on success; an object like `{ rateLimit: "..." }` or `{ token: "..." }` on failure. */
  errors: string[] | Record<string, string>;
  results: number;
  paging: { current: number; total: number };
  response: T;
}

// --- /status -----------------------------------------------------------------
export interface ApiStatus {
  account: { firstname: string; lastname: string; email: string };
  subscription: { plan: string; end: string; active: boolean };
  requests: { current: number; limit_day: number };
}

// --- /fixtures ---------------------------------------------------------------
export type FixtureStatusShort =
  | "TBD"
  | "NS"
  | "1H"
  | "HT"
  | "2H"
  | "ET"
  | "BT"
  | "P"
  | "SUSP"
  | "INT"
  | "FT"
  | "AET"
  | "PEN"
  | "PST"
  | "CANC"
  | "ABD"
  | "AWD"
  | "WO"
  | "LIVE";

export interface ApiTeamRef {
  id: number;
  name: string;
  logo: string;
}

export interface ApiFixture {
  fixture: {
    id: number;
    referee: string | null;
    timezone: string;
    date: string;
    timestamp: number;
    venue: { id: number | null; name: string | null; city: string | null };
    status: { long: string; short: FixtureStatusShort; elapsed: number | null };
  };
  league: {
    id: number;
    name: string;
    country: string;
    season: number;
    round: string;
  };
  teams: {
    home: ApiTeamRef & { winner: boolean | null };
    away: ApiTeamRef & { winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
}

// --- /players/squads ---------------------------------------------------------
export type ApiSquadPosition = "Goalkeeper" | "Defender" | "Midfielder" | "Attacker";

export interface ApiSquad {
  team: ApiTeamRef;
  players: {
    id: number;
    name: string;
    age: number | null;
    number: number | null;
    position: ApiSquadPosition;
    photo: string;
  }[];
}

// --- /fixtures/lineups -------------------------------------------------------
export interface ApiLineupPlayer {
  player: {
    id: number;
    name: string;
    number: number | null;
    pos: "G" | "D" | "M" | "F" | null;
    grid: string | null;
  };
}

export interface ApiLineup {
  team: ApiTeamRef;
  formation: string | null;
  startXI: ApiLineupPlayer[];
  substitutes: ApiLineupPlayer[];
  coach: { id: number | null; name: string | null };
}

// --- /fixtures/players -------------------------------------------------------
export interface ApiPlayerFixtureStatistics {
  games: {
    minutes: number | null;
    number: number | null;
    position: "G" | "D" | "M" | "F" | null;
    rating: string | null;
    captain: boolean;
    substitute: boolean;
  };
  goals: {
    total: number | null;
    conceded: number | null;
    assists: number | null;
    saves: number | null;
  };
  cards: { yellow: number | null; red: number | null };
  penalty: {
    won: number | null;
    commited: number | null;
    scored: number | null;
    missed: number | null;
    saved: number | null;
  };
}

export interface ApiFixturePlayers {
  team: ApiTeamRef & { update: string };
  players: {
    player: { id: number; name: string; photo: string };
    statistics: ApiPlayerFixtureStatistics[];
  }[];
}
