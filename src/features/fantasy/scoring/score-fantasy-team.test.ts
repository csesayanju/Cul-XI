import { describe, expect, it } from "vitest";

import { EMPTY_STATS, type PlayerMatchStats, type Position } from "../types";
import { scoreFantasyTeam, type StoredPick } from "./score-fantasy-team";

const shape: Position[] = [
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
];

function team(): StoredPick[] {
  return shape.map((position, i) => ({
    playerId: i + 1,
    name: `Player ${i + 1}`,
    position,
    teamId: i < 6 ? 529 : 9001,
    price: 8,
    isCaptain: i === 9,
    isViceCaptain: i === 5,
  }));
}

const played = (s: Partial<PlayerMatchStats> = {}): PlayerMatchStats => ({
  ...EMPTY_STATS,
  minutes: 90,
  ...s,
});

describe("scoreFantasyTeam", () => {
  it("scores a valid team with the captain bonus and names in the breakdown", () => {
    const stats = new Map<number, PlayerMatchStats>(
      shape.map((_, i) => [i + 1, played(i === 9 ? { goals: 1 } : {})]),
    );
    const result = scoreFantasyTeam(team(), stats, [529, 9001]);
    // 10 players x 2 appearance + captain FWD (2 + 4) x 2
    expect(result.total).toBe(20 + 12);
    expect(result.breakdown.valid).toBe(true);
    expect(result.breakdown.armbandApplied).toBe("captain");
    expect(result.breakdown.players[9]).toMatchObject({ name: "Player 10", points: 12 });
  });

  it("gives 0 to players without stats", () => {
    const result = scoreFantasyTeam(team(), new Map(), [529, 9001]);
    expect(result.total).toBe(0);
    expect(result.breakdown.armbandApplied).toBe("none");
  });

  it("scores an invalid team as 0 and records why", () => {
    const picks = team();
    picks[0]!.price = 50; // way over budget
    const stats = new Map([[1, played({ goals: 3 })]]);
    const result = scoreFantasyTeam(picks, stats);
    expect(result.total).toBe(0);
    expect(result.breakdown.valid).toBe(false);
    expect(result.breakdown.errors?.map((e) => e.code)).toEqual(["OVER_BUDGET"]);
  });
});
