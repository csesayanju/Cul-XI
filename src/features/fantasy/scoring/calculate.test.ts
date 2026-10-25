import { describe, expect, it } from "vitest";

import { EMPTY_STATS, type PlayerMatchStats, type Position } from "../types";
import { calculatePlayerPoints, calculateTeamPoints, type TeamPick } from "./calculate";
import { SCORING_RULES } from "./rules";

const stats = (overrides: Partial<PlayerMatchStats> = {}): PlayerMatchStats => ({
  ...EMPTY_STATS,
  minutes: 90,
  ...overrides,
});

const points = (s: Partial<PlayerMatchStats>, pos: Position) =>
  calculatePlayerPoints(stats(s), pos).points;

describe("calculatePlayerPoints", () => {
  describe("appearance", () => {
    it("gives 0 points and no breakdown when the player did not play", () => {
      expect(calculatePlayerPoints(stats({ minutes: 0, goals: 2 }), "FWD")).toEqual({
        points: 0,
        breakdown: [],
      });
    });

    it.each([
      [1, 1],
      [59, 1],
      [60, 2],
      [90, 2],
      [120, 2],
    ])("%i minutes -> %i points", (minutes, expected) => {
      expect(points({ minutes }, "MID")).toBe(expected);
    });
  });

  describe("goals by position", () => {
    it.each<[Position, number]>([
      ["GK", 6],
      ["DEF", 6],
      ["MID", 5],
      ["FWD", 4],
    ])("%s goal is worth %i", (pos, perGoal) => {
      expect(points({ goals: 1 }, pos)).toBe(2 + perGoal);
      expect(points({ goals: 3 }, pos)).toBe(2 + 3 * perGoal);
    });
  });

  it("gives 3 points per assist regardless of position", () => {
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      expect(points({ assists: 2 }, pos)).toBe(2 + 6);
    }
  });

  describe("clean sheet", () => {
    it.each<[Position, number]>([
      ["GK", 4],
      ["DEF", 4],
      ["MID", 1],
      ["FWD", 0],
    ])("%s clean sheet is worth %i", (pos, cs) => {
      expect(points({ cleanSheet: true }, pos)).toBe(2 + cs);
    });

    it("requires the minimum minutes on the pitch", () => {
      const min = SCORING_RULES.cleanSheet.minMinutes;
      expect(points({ minutes: min - 1, cleanSheet: true }, "DEF")).toBe(1);
      expect(points({ minutes: min, cleanSheet: true }, "DEF")).toBe(2 + 4);
    });

    it("omits FWD clean sheets from the breakdown (0 points)", () => {
      const { breakdown } = calculatePlayerPoints(stats({ cleanSheet: true }), "FWD");
      expect(breakdown.map((l) => l.key)).toEqual(["appearance"]);
    });
  });

  describe("saves", () => {
    it.each([
      [0, 0],
      [2, 0],
      [3, 1],
      [5, 1],
      [6, 2],
      [10, 3],
    ])("%i saves -> %i points", (saves, expected) => {
      expect(points({ saves }, "GK")).toBe(2 + expected);
    });
  });

  it("gives 5 per penalty saved and -2 per penalty missed", () => {
    expect(points({ penaltiesSaved: 1 }, "GK")).toBe(2 + 5);
    expect(points({ penaltiesSaved: 2 }, "GK")).toBe(2 + 10);
    expect(points({ penaltiesMissed: 1 }, "FWD")).toBe(2 - 2);
    expect(points({ penaltiesMissed: 2 }, "MID")).toBe(2 - 4);
  });

  describe("goals conceded", () => {
    it.each([
      [0, 0],
      [1, 0],
      [2, -1],
      [3, -1],
      [4, -2],
      [5, -2],
    ])("GK/DEF conceding %i -> %i", (goalsConceded, expected) => {
      expect(points({ goalsConceded }, "GK")).toBe(2 + expected);
      expect(points({ goalsConceded }, "DEF")).toBe(2 + expected);
    });

    it("does not affect MID or FWD", () => {
      expect(points({ goalsConceded: 4 }, "MID")).toBe(2);
      expect(points({ goalsConceded: 4 }, "FWD")).toBe(2);
    });
  });

  it("applies card and own-goal deductions", () => {
    expect(points({ yellowCards: 1 }, "MID")).toBe(1);
    expect(points({ redCards: 1 }, "MID")).toBe(-1);
    expect(points({ yellowCards: 1, redCards: 1 }, "MID")).toBe(-2);
    expect(points({ ownGoals: 1 }, "DEF")).toBe(0);
  });

  it("can go negative", () => {
    expect(points({ minutes: 30, redCards: 1, ownGoals: 1, goalsConceded: 2 }, "DEF")).toBe(
      1 - 3 - 2 - 1,
    );
  });

  it("produces a breakdown that sums to the total", () => {
    const result = calculatePlayerPoints(
      stats({
        goals: 1,
        assists: 1,
        cleanSheet: true,
        saves: 7,
        penaltiesSaved: 1,
        yellowCards: 1,
      }),
      "GK",
    );
    // 2 app + 6 goal + 3 assist + 4 cs + 2 saves + 5 pen save - 1 yellow
    expect(result.points).toBe(21);
    expect(result.breakdown.reduce((s, l) => s + l.points, 0)).toBe(result.points);
    expect(result.breakdown.find((l) => l.key === "saves")).toEqual({
      key: "saves",
      value: 7,
      points: 2,
    });
  });

  it("scores a realistic striker haul", () => {
    // 90' brace + assist + yellow: 2 + 8 + 3 - 1
    expect(points({ goals: 2, assists: 1, yellowCards: 1 }, "FWD")).toBe(12);
  });

  it("honours custom rules", () => {
    const rules = { ...SCORING_RULES, assist: 10 };
    expect(calculatePlayerPoints(stats({ assists: 1 }), "MID", rules).points).toBe(12);
  });
});

describe("calculateTeamPoints", () => {
  const pick = (
    playerId: number,
    s: Partial<PlayerMatchStats> | null,
    extra: Partial<TeamPick> = {},
  ): TeamPick => ({
    playerId,
    position: "MID",
    isCaptain: false,
    isViceCaptain: false,
    stats: s === null ? null : stats(s),
    ...extra,
  });

  it("doubles the captain's points", () => {
    const result = calculateTeamPoints([
      pick(1, { goals: 1 }, { isCaptain: true }), // 7 -> 14
      pick(2, { goals: 1 }, { isViceCaptain: true }), // 7
      pick(3, {}), // 2
    ]);
    expect(result.armbandApplied).toBe("captain");
    expect(result.players.map((p) => p.points)).toEqual([14, 7, 2]);
    expect(result.total).toBe(23);
  });

  it("gives the vice-captain 1.5x when the captain did not play", () => {
    const result = calculateTeamPoints([
      pick(1, { minutes: 0 }, { isCaptain: true }),
      pick(2, { goals: 1 }, { isViceCaptain: true }), // 7 * 1.5 = 10.5
      pick(3, {}),
    ]);
    expect(result.armbandApplied).toBe("vice-captain");
    expect(result.players[0]!.points).toBe(0);
    expect(result.players[1]).toMatchObject({ basePoints: 7, multiplier: 1.5, points: 10.5 });
    expect(result.total).toBe(12.5);
  });

  it("treats a captain with no stats row as not having played", () => {
    const result = calculateTeamPoints([
      pick(1, null, { isCaptain: true }),
      pick(2, { goals: 1 }, { isViceCaptain: true }),
    ]);
    expect(result.armbandApplied).toBe("vice-captain");
    expect(result.total).toBe(10.5);
  });

  it("applies no multiplier if neither captain nor vice played", () => {
    const result = calculateTeamPoints([
      pick(1, { minutes: 0 }, { isCaptain: true }),
      pick(2, { minutes: 0 }, { isViceCaptain: true }),
      pick(3, { goals: 1 }),
    ]);
    expect(result.armbandApplied).toBe("none");
    expect(result.total).toBe(7);
  });

  it("does not give the vice-captain a bonus when the captain played (even 1 minute)", () => {
    const result = calculateTeamPoints([
      pick(1, { minutes: 1 }, { isCaptain: true }), // 1 -> 2
      pick(2, { goals: 2 }, { isViceCaptain: true }), // 12
    ]);
    expect(result.armbandApplied).toBe("captain");
    expect(result.total).toBe(14);
  });

  it("multiplies negative captain scores too", () => {
    const result = calculateTeamPoints([pick(1, { redCards: 1 }, { isCaptain: true })]);
    expect(result.total).toBe(-2);
  });

  it("tags each pick's role", () => {
    const result = calculateTeamPoints([
      pick(1, {}, { isCaptain: true }),
      pick(2, {}, { isViceCaptain: true }),
      pick(3, {}),
    ]);
    expect(result.players.map((p) => p.role)).toEqual(["captain", "vice-captain", null]);
  });
});
