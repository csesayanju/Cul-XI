import { TEAM_RULES } from "../scoring/rules";
import { POSITIONS, type Position } from "../types";

export interface SelectablePlayer {
  playerId: number;
  position: Position;
  /** API team id of the player's club. */
  teamId: number;
  price: number;
}

export interface TeamSelection {
  players: SelectablePlayer[];
  captainId: number | null;
  viceCaptainId: number | null;
}

export type TeamValidationCode =
  | "SQUAD_SIZE"
  | "DUPLICATE_PLAYER"
  | "PLAYER_NOT_IN_MATCH"
  | "OVER_BUDGET"
  | "TOO_MANY_FROM_TEAM"
  | "FORMATION"
  | "CAPTAIN_MISSING"
  | "VICE_CAPTAIN_MISSING"
  | "CAPTAIN_NOT_IN_TEAM"
  | "VICE_CAPTAIN_NOT_IN_TEAM"
  | "CAPTAIN_IS_VICE_CAPTAIN";

export interface TeamValidationError {
  code: TeamValidationCode;
  message: string;
}

export interface TeamValidationResult {
  valid: boolean;
  errors: TeamValidationError[];
  totalCost: number;
  remainingBudget: number;
  countsByPosition: Record<Position, number>;
  countsByTeam: Record<number, number>;
}

export interface ValidateOptions {
  /** If given, every player must belong to one of these clubs (Barça + the opponent). */
  allowedTeamIds?: readonly number[];
  rules?: typeof TEAM_RULES;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Validates a fantasy XI against budget, club limit, formation and armband rules. */
export function validateTeam(
  selection: TeamSelection,
  { allowedTeamIds, rules = TEAM_RULES }: ValidateOptions = {},
): TeamValidationResult {
  const errors: TeamValidationError[] = [];
  const err = (code: TeamValidationCode, message: string) => errors.push({ code, message });
  const { players, captainId, viceCaptainId } = selection;

  const ids = players.map((p) => p.playerId);
  const unique = new Set(ids);
  if (unique.size !== ids.length) err("DUPLICATE_PLAYER", "The same player is picked twice.");

  if (players.length !== rules.squadSize) {
    err("SQUAD_SIZE", `Pick exactly ${rules.squadSize} players (you have ${players.length}).`);
  }

  if (allowedTeamIds) {
    const outsiders = players.filter((p) => !allowedTeamIds.includes(p.teamId));
    if (outsiders.length > 0) {
      err("PLAYER_NOT_IN_MATCH", "Some players are not part of this match.");
    }
  }

  const totalCost = round1(players.reduce((sum, p) => sum + p.price, 0));
  if (totalCost > rules.budget) {
    err("OVER_BUDGET", `Team costs ${totalCost} credits; the budget is ${rules.budget}.`);
  }

  const countsByTeam: Record<number, number> = {};
  for (const p of players) countsByTeam[p.teamId] = (countsByTeam[p.teamId] ?? 0) + 1;
  if (Object.values(countsByTeam).some((n) => n > rules.maxPerTeam)) {
    err("TOO_MANY_FROM_TEAM", `Maximum ${rules.maxPerTeam} players from one team.`);
  }

  const countsByPosition = Object.fromEntries(POSITIONS.map((pos) => [pos, 0])) as Record<
    Position,
    number
  >;
  for (const p of players) countsByPosition[p.position] += 1;
  for (const pos of POSITIONS) {
    const { min, max } = rules.formation[pos];
    const n = countsByPosition[pos];
    if (n < min || n > max) {
      const range = min === max ? `${min}` : `${min}–${max}`;
      err("FORMATION", `You need ${range} ${pos} (you have ${n}).`);
    }
  }

  if (captainId == null) err("CAPTAIN_MISSING", "Choose a captain.");
  else if (!unique.has(captainId)) err("CAPTAIN_NOT_IN_TEAM", "Your captain must be in your XI.");

  if (viceCaptainId == null) err("VICE_CAPTAIN_MISSING", "Choose a vice-captain.");
  else if (!unique.has(viceCaptainId)) {
    err("VICE_CAPTAIN_NOT_IN_TEAM", "Your vice-captain must be in your XI.");
  }

  if (captainId != null && captainId === viceCaptainId) {
    err("CAPTAIN_IS_VICE_CAPTAIN", "Captain and vice-captain must be different players.");
  }

  return {
    valid: errors.length === 0,
    errors,
    totalCost,
    remainingBudget: round1(rules.budget - totalCost),
    countsByPosition,
    countsByTeam,
  };
}
