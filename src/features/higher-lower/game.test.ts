import { describe, expect, it } from "vitest";

import { applyHol, isRight, nextOpponent } from "./game";

describe("isRight", () => {
  it("judges higher/lower, with ties right either way", () => {
    expect(isRight(100, 150, "higher")).toBe(true);
    expect(isRight(100, 150, "lower")).toBe(false);
    expect(isRight(100, 100, "higher")).toBe(true);
    expect(isRight(100, 100, "lower")).toBe(true);
  });
});

describe("nextOpponent", () => {
  it("never repeats the excluded players", () => {
    for (let i = 0; i < 20; i++) expect(nextOpponent([1, 2, 3], [1, 2])).toBe(3);
    expect(nextOpponent([1], [1])).toBeNull();
  });
});

describe("applyHol", () => {
  const pool = [1, 2, 3, 4, 5];
  const run = { aId: 1, bId: 2, streak: 4, best: 6 };

  it("moves B to A and grows the streak on a right call", () => {
    const { run: next, right } = applyHol(run, { a: 100, b: 200 }, "higher", pool, () => 0);
    expect(right).toBe(true);
    expect(next).toMatchObject({ aId: 2, streak: 5, best: 6 });
    expect([1, 2]).not.toContain(next.bId);
  });

  it("raises the best when the streak passes it", () => {
    const { run: next } = applyHol({ ...run, streak: 6 }, { a: 1, b: 2 }, "higher", pool);
    expect(next.best).toBe(7);
  });

  it("resets the streak but keeps the best on a wrong call", () => {
    const { run: next, right } = applyHol(run, { a: 100, b: 200 }, "lower", pool);
    expect(right).toBe(false);
    expect(next.streak).toBe(0);
    expect(next.best).toBe(6);
    expect(next.aId).not.toBe(next.bId);
  });
});
