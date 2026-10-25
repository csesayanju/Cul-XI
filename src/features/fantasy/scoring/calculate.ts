import type { PlayerMatchStats, Position } from "../types";
import { SCORING_RULES, type ScoringRules } from "./rules";

export type ScoreKey =
  | "appearance"
  | "goals"
  | "assists"
  | "cleanSheet"
  | "saves"
  | "penaltiesSaved"
  | "penaltiesMissed"
  | "goalsConceded"
  | "yellowCards"
  | "redCards"
  | "ownGoals";

export interface ScoreLine {
  key: ScoreKey;
  /** Raw count that produced the points (e.g. 2 goals, 7 saves, 90 minutes). */
  value: number;
  points: number;
}

export interface PlayerScore {
  points: number;
  breakdown: ScoreLine[];
}

/**
 * Pure scoring function: stats + position -> points with a line-by-line breakdown.
 * A player who did not play (0 minutes) scores nothing.
 */
export function calculatePlayerPoints(
  stats: PlayerMatchStats,
  position: Position,
  rules: ScoringRules = SCORING_RULES,
): PlayerScore {
  if (stats.minutes <= 0) return { points: 0, breakdown: [] };

  const lines: ScoreLine[] = [];
  const add = (key: ScoreKey, value: number, points: number) => {
    if (points !== 0) lines.push({ key, value, points });
  };

  add(
    "appearance",
    stats.minutes,
    stats.minutes >= rules.appearance.fullMinutes
      ? rules.appearance.full
      : rules.appearance.partial,
  );
  add("goals", stats.goals, stats.goals * rules.goal[position]);
  add("assists", stats.assists, stats.assists * rules.assist);

  if (stats.cleanSheet && stats.minutes >= rules.cleanSheet.minMinutes) {
    add("cleanSheet", 1, rules.cleanSheet.points[position]);
  }

  add("saves", stats.saves, Math.floor(stats.saves / rules.saves.per) * rules.saves.points);
  add("penaltiesSaved", stats.penaltiesSaved, stats.penaltiesSaved * rules.penaltySave);
  add("penaltiesMissed", stats.penaltiesMissed, stats.penaltiesMissed * rules.penaltyMiss);

  if (rules.goalsConceded.positions.includes(position)) {
    add(
      "goalsConceded",
      stats.goalsConceded,
      Math.floor(stats.goalsConceded / rules.goalsConceded.per) * rules.goalsConceded.points,
    );
  }

  add("yellowCards", stats.yellowCards, stats.yellowCards * rules.yellowCard);
  add("redCards", stats.redCards, stats.redCards * rules.redCard);
  add("ownGoals", stats.ownGoals, stats.ownGoals * rules.ownGoal);

  return { points: lines.reduce((sum, l) => sum + l.points, 0), breakdown: lines };
}

export interface TeamPick {
  playerId: number;
  position: Position;
  isCaptain: boolean;
  isViceCaptain: boolean;
  /** `null` when no stats exist for the player (e.g. not in the matchday squad). */
  stats: PlayerMatchStats | null;
}

export interface PickScore extends PlayerScore {
  playerId: number;
  basePoints: number;
  multiplier: number;
  role: "captain" | "vice-captain" | null;
}

export interface TeamScore {
  total: number;
  players: PickScore[];
  /** Which pick's multiplier was applied (captain, vice-captain, or none if neither played). */
  armbandApplied: "captain" | "vice-captain" | "none";
}

const played = (p: TeamPick | undefined) => !!p?.stats && p.stats.minutes > 0;
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Scores a whole fantasy XI. The captain earns `captainMultiplier`; if the captain did not
 * play, the vice-captain earns `viceCaptainMultiplier` instead.
 */
export function calculateTeamPoints(
  picks: TeamPick[],
  rules: ScoringRules = SCORING_RULES,
): TeamScore {
  const captain = picks.find((p) => p.isCaptain);
  const vice = picks.find((p) => p.isViceCaptain);
  const armbandApplied = played(captain) ? "captain" : played(vice) ? "vice-captain" : "none";

  const players = picks.map((pick): PickScore => {
    const base = pick.stats
      ? calculatePlayerPoints(pick.stats, pick.position, rules)
      : { points: 0, breakdown: [] };
    let multiplier = 1;
    if (armbandApplied === "captain" && pick.isCaptain) multiplier = rules.captainMultiplier;
    if (armbandApplied === "vice-captain" && pick.isViceCaptain)
      multiplier = rules.viceCaptainMultiplier;

    return {
      playerId: pick.playerId,
      basePoints: base.points,
      multiplier,
      points: round1(base.points * multiplier),
      breakdown: base.breakdown,
      role: pick.isCaptain ? "captain" : pick.isViceCaptain ? "vice-captain" : null,
    };
  });

  return {
    total: round1(players.reduce((sum, p) => sum + p.points, 0)),
    players,
    armbandApplied,
  };
}
