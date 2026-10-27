import { describe, expect, it } from "vitest";

import { autoLists, formatEuros, topTen, wikidataDrafts, type CurrentPlayerStats } from "./lists";

const squad = (n: number, f: (i: number) => Partial<CurrentPlayerStats>): CurrentPlayerStats[] =>
  Array.from({ length: n }, (_, i) => ({
    triviaPlayerId: i + 1,
    name: `P${i + 1}`,
    marketValue: null,
    season: null,
    ...f(i),
  }));

describe("topTen", () => {
  const id = (x: { id: number }) => x.id;
  const label = (v: number) => `${v}`;

  it("ranks the top 10 by value", () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ id: i, v: i }));
    const top = topTen(items, (x) => x.v, id, label)!;
    expect(top.map((e) => e.playerId)).toEqual([14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
  });

  it("refuses unfair lists: fewer than 10 players, or a tie for 10th place", () => {
    expect(
      topTen(
        Array.from({ length: 9 }, (_, i) => ({ id: i, v: i + 1 })),
        (x) => x.v,
        id,
        label,
      ),
    ).toBeNull();
    const tie = Array.from({ length: 12 }, (_, i) => ({ id: i, v: i < 9 ? 20 - i : 5 }));
    expect(topTen(tie, (x) => x.v, id, label)).toBeNull();
  });

  it("ignores zero and missing values", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: i, v: 10 - i })),
      { id: 99, v: 0 },
    ];
    expect(topTen(items, (x) => x.v, id, label)).toHaveLength(10);
  });
});

describe("autoLists", () => {
  it("builds the fair season lists and skips the rest", () => {
    const players = squad(14, (i) => ({
      marketValue: (20 + i) * 1_000_000,
      season: { games: 10, minutes: 900 - i * 50, goals: 14 - i, assists: i < 9 ? 2 : 0 },
    }));
    const lists = autoLists(players, "26/27");
    const keys = lists.map((l) => l.key);
    expect(keys).toContain("auto:goals");
    expect(keys).toContain("auto:minutes");
    expect(keys).toContain("auto:value");
    expect(keys).not.toContain("auto:assists"); // only 9 players with assists
    expect(keys).not.toContain("auto:games"); // everyone has 10 apps: tie
    const goals = lists.find((l) => l.key === "auto:goals")!;
    expect(goals.entries[0]).toEqual({ playerId: 1, statLabel: "14 goals" });
    expect(lists.find((l) => l.key === "auto:value")!.entries[0]!.statLabel).toBe("€33m");
  });
});

describe("wikidataDrafts", () => {
  it("drafts all-time lists and per-nation lists for well-represented countries", () => {
    const players = Array.from({ length: 30 }, (_, i) => ({
      id: i + 1,
      name: `H${i + 1}`,
      nationality: i < 14 ? "Netherlands" : "Spain",
      wdApps: 300 - i * 7,
      wdGoals: i < 12 ? 200 - i * 9 : null,
    }));
    const drafts = wikidataDrafts(players);
    const keys = drafts.map((d) => d.key);
    expect(keys).toEqual(["wd:goals", "wd:apps", "wd:apps:netherlands"]);
    expect(drafts[0]!.entries[0]).toEqual({ playerId: 1, statLabel: "200 goals" });
    expect(drafts[0]!.subtitle).toMatch(/verify/);
  });
});

it("formats euros", () => {
  expect(formatEuros(220_000_000)).toBe("€220m");
  expect(formatEuros(800_000)).toBe("€800k");
});
