import type { Position } from "../types";

export interface ScoringRules {
  appearance: { fullMinutes: number; full: number; partial: number };
  goal: Record<Position, number>;
  assist: number;
  cleanSheet: { points: Record<Position, number>; minMinutes: number };
  saves: { per: number; points: number };
  penaltySave: number;
  penaltyMiss: number;
  goalsConceded: { per: number; points: number; positions: readonly Position[] };
  yellowCard: number;
  redCard: number;
  ownGoal: number;
  captainMultiplier: number;
  viceCaptainMultiplier: number;
}

/**
 * Culé XI scoring rules — the single place to tweak points.
 * Changing a value here changes scoring everywhere (engine, README table, admin recalc).
 */
export const SCORING_RULES: Readonly<ScoringRules> = {
  appearance: {
    /** Minutes needed for the full appearance bonus. */
    fullMinutes: 60,
    full: 2,
    partial: 1,
  },
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: {
    points: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
    /** A clean sheet only counts if the player was on the pitch for at least this long. */
    minMinutes: 60,
  },
  saves: { per: 3, points: 1 },
  penaltySave: 5,
  penaltyMiss: -2,
  goalsConceded: {
    per: 2,
    points: -1,
    positions: ["GK", "DEF"],
  },
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  captainMultiplier: 2,
  /** Applies only when the captain did not play (0 minutes). */
  viceCaptainMultiplier: 1.5,
};

/** Squad-building rules enforced by `validateTeam`. */
export const TEAM_RULES = {
  squadSize: 11,
  budget: 100,
  maxPerTeam: 7,
  formation: {
    GK: { min: 1, max: 1 },
    DEF: { min: 3, max: 5 },
    MID: { min: 3, max: 5 },
    FWD: { min: 1, max: 3 },
  } satisfies Record<Position, { min: number; max: number }>,
} as const;
