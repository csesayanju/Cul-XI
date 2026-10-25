export const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type Position = (typeof POSITIONS)[number];

export type Competition = "laliga" | "ucl" | "copa";

/** One player's stat line for a single match (mirrors `player_match_stats`). */
export interface PlayerMatchStats {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  goalsConceded: number;
  yellowCards: number;
  redCards: number;
  penaltiesMissed: number;
  penaltiesSaved: number;
  ownGoals: number;
}

export const EMPTY_STATS: PlayerMatchStats = {
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanSheet: false,
  saves: 0,
  goalsConceded: 0,
  yellowCards: 0,
  redCards: 0,
  penaltiesMissed: 0,
  penaltiesSaved: 0,
  ownGoals: 0,
};
