import { describe, expect, it } from "vitest";

import { layoutXI, applyXiGuess, NEW_XI } from "@/features/missing-xi/game";
import { makeRound, scoreOoo } from "@/features/odd-one-out/game";

import { applyConnectionsGuess, buildConnections, NEW_CONNECTIONS } from "./game";

// Four overlapping groups of 12 over ids 1..40, most famous = lowest id.
const candidates = [
  { label: "A", ids: Array.from({ length: 12 }, (_, i) => i + 1) },
  { label: "B", ids: Array.from({ length: 12 }, (_, i) => i + 10) },
  { label: "C", ids: Array.from({ length: 12 }, (_, i) => i + 20) },
  { label: "D", ids: Array.from({ length: 12 }, (_, i) => i + 30) },
];
const fameRank = new Map(Array.from({ length: 50 }, (_, i) => [i + 1, i]));

describe("buildConnections", () => {
  const p = buildConnections(candidates, "2026-11-01", fameRank)!;

  it("makes four groups of four where every player has exactly one home", () => {
    expect(p.groups).toHaveLength(4);
    const all = p.groups.flatMap((g) => g.ids);
    expect(new Set(all).size).toBe(16);
    for (const g of p.groups) {
      const others = candidates.filter((c) => c.label !== g.label);
      for (const id of g.ids) expect(others.some((c) => c.ids.includes(id))).toBe(false);
    }
    expect([...p.order].sort((a, b) => a - b)).toEqual([...all].sort((a, b) => a - b));
  });

  it("is the same for the same day", () => {
    expect(buildConnections(candidates, "2026-11-01", fameRank)).toEqual(p);
  });
});

describe("applyConnectionsGuess", () => {
  const p = buildConnections(candidates, "x", fameRank)!;
  const g0 = p.groups[0]!.ids;
  const g1 = p.groups[1]!.ids;

  it("solves a group, says one away, counts mistakes and ends at four", () => {
    const right = applyConnectionsGuess(p, NEW_CONNECTIONS, g0);
    expect(right.outcome).toEqual({ kind: "correct", group: 0 });
    const close = applyConnectionsGuess(p, NEW_CONNECTIONS, [...g0.slice(0, 3), g1[0]!]);
    expect(close.outcome.kind).toBe("one-away");
    let s = NEW_CONNECTIONS;
    for (let i = 0; i < 4; i++) {
      s = applyConnectionsGuess(p, s, [g0[0]!, g0[1]!, g1[0]!, g1[1]!]).state;
    }
    expect(s).toMatchObject({ mistakes: 4, finished: true });
  });

  it("rejects picks that aren't four players still in play", () => {
    const solved = applyConnectionsGuess(p, NEW_CONNECTIONS, g0).state;
    expect(applyConnectionsGuess(p, solved, g0).outcome.kind).toBe("invalid");
    expect(applyConnectionsGuess(p, NEW_CONNECTIONS, g0.slice(0, 3)).outcome.kind).toBe("invalid");
  });
});

describe("Missing XI", () => {
  const slots = ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "RW", "CF", "LW"].map(
    (pos, i) => ({ pos, number: i + 1, playerId: 100 + i, captain: i === 3 }),
  );

  it("lays the XI out from the goalkeeper up, left-sided players on the left", () => {
    const at = layoutXI(slots.map((s) => s.pos));
    expect(at[0]!.y).toBeGreaterThan(at[9]!.y); // GK below the striker
    expect(at[4]!.x).toBeLessThan(at[1]!.x); // LB left of RB
    expect(at[10]!.x).toBeLessThan(at[8]!.x); // LW left of RW
  });

  it("finds players, costs lives on misses and ends after five", () => {
    const hit = applyXiGuess(slots, NEW_XI, 105);
    expect(hit.outcome).toEqual({ kind: "correct", slot: 5 });
    let s = NEW_XI;
    for (let i = 0; i < 5; i++) s = applyXiGuess(slots, s, 1 + i).state;
    expect(s).toMatchObject({ livesLeft: 0, finished: true });
  });
});

describe("Odd One Out", () => {
  it("makes rounds of three members and one outsider", () => {
    const cats = [{ prompt: "never played for A", ids: [1, 2, 3, 4, 5] }];
    for (let i = 0; i < 10; i++) {
      const r = makeRound(cats, [1, 2, 3, 40, 41])!;
      expect(r.options).toHaveLength(4);
      expect([40, 41]).toContain(r.answerId);
      expect(r.options.filter((id) => id <= 5)).toHaveLength(3);
    }
  });

  it("tracks streaks", () => {
    expect(scoreOoo({ streak: 2, best: 5 }, true)).toEqual({ streak: 3, best: 5 });
    expect(scoreOoo({ streak: 7, best: 5 }, true)).toEqual({ streak: 8, best: 8 });
    expect(scoreOoo({ streak: 7, best: 8 }, false)).toEqual({ streak: 0, best: 8 });
  });
});
