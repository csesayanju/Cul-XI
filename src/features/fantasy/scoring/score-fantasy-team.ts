import type { PlayerMatchStats, Position } from "../types";
import { validateTeam, type TeamValidationError } from "../validation/validate-team";
import { calculateTeamPoints, type PickScore } from "./calculate";

export interface StoredPick {
  playerId: number;
  name: string;
  position: Position;
  teamId: number;
  price: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface FantasyPointsBreakdown {
  valid: boolean;
  errors?: TeamValidationError[];
  armbandApplied?: "captain" | "vice-captain" | "none";
  players: (PickScore & { name: string })[];
}

export interface FantasyTeamResult {
  total: number;
  breakdown: FantasyPointsBreakdown;
}

/**
 * Scores a saved fantasy team for one match. The team is re-validated first: a team that
 * breaks the rules (e.g. saved by bypassing the UI) scores 0 with the reasons recorded.
 */
export function scoreFantasyTeam(
  picks: StoredPick[],
  statsByPlayerId: ReadonlyMap<number, PlayerMatchStats>,
  allowedTeamIds?: readonly number[],
): FantasyTeamResult {
  const validation = validateTeam(
    {
      players: picks.map(({ playerId, position, teamId, price }) => ({
        playerId,
        position,
        teamId,
        price,
      })),
      captainId: picks.find((p) => p.isCaptain)?.playerId ?? null,
      viceCaptainId: picks.find((p) => p.isViceCaptain)?.playerId ?? null,
    },
    { allowedTeamIds },
  );

  if (!validation.valid) {
    return { total: 0, breakdown: { valid: false, errors: validation.errors, players: [] } };
  }

  const score = calculateTeamPoints(
    picks.map((p) => ({
      playerId: p.playerId,
      position: p.position,
      isCaptain: p.isCaptain,
      isViceCaptain: p.isViceCaptain,
      stats: statsByPlayerId.get(p.playerId) ?? null,
    })),
  );
  const names = new Map(picks.map((p) => [p.playerId, p.name]));

  return {
    total: score.total,
    breakdown: {
      valid: true,
      armbandApplied: score.armbandApplied,
      players: score.players.map((p) => ({ ...p, name: names.get(p.playerId) ?? "" })),
    },
  };
}
