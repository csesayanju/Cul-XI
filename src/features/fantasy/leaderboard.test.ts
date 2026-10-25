import { describe, expect, it } from "vitest";

import { buildStandings } from "./leaderboard";

const members = new Map([
  ["a", "Ana"],
  ["b", "Bruno"],
  ["c", "Carla"],
  ["d", "Dani"],
]);

describe("buildStandings", () => {
  it("sums points across matches and sorts descending", () => {
    const table = buildStandings(
      [
        { userId: "a", matchId: 1, points: 30 },
        { userId: "a", matchId: 2, points: 12.5 },
        { userId: "b", matchId: 1, points: 50 },
        { userId: "c", matchId: 2, points: 10 },
      ],
      members,
    );
    expect(table.map((s) => [s.rank, s.name, s.points, s.played])).toEqual([
      [1, "Bruno", 50, 1],
      [2, "Ana", 42.5, 2],
      [3, "Carla", 10, 1],
      [4, "Dani", 0, 0],
    ]);
  });

  it("gives tied players the same rank and skips the next", () => {
    const table = buildStandings(
      [
        { userId: "a", matchId: 1, points: 20 },
        { userId: "b", matchId: 1, points: 20 },
        { userId: "c", matchId: 1, points: 20 },
        { userId: "d", matchId: 1, points: 5 },
      ],
      members,
    );
    expect(table.map((s) => s.rank)).toEqual([1, 1, 1, 4]);
  });

  it("ignores rows from users outside the league", () => {
    const table = buildStandings([{ userId: "zzz", matchId: 1, points: 99 }], members);
    expect(table.every((s) => s.points === 0)).toBe(true);
    expect(table).toHaveLength(4);
  });
});
