import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  formScore,
  priceFor,
  PRICE_BANDS,
  statusScore,
  UNKNOWN_STATUS,
  type PlayerForm,
} from "./pricing";
import { TEAM_RULES } from "./scoring/rules";
import type { Position } from "./types";

const M = 1_000_000;
const form = (f: Partial<PlayerForm>): PlayerForm => ({ ...EMPTY_FORM, matches: 5, ...f });

/** A regular starter's last 5 matches. */
const starter = form({ apps: 5, starts: 5, minutes: 420, avgRating: 6.9, goals: 1 });
/** Quiet patch: rotated / back from injury, few minutes. */
const quiet = form({ apps: 2, starts: 1, minutes: 80, avgRating: 7.0 });
/** Hot streak. */
const hot = form({ apps: 5, starts: 5, minutes: 450, avgRating: 7.6, goals: 4, assists: 2 });
/** Unused squad player. */
const bench = form({ apps: 1, starts: 0, minutes: 10, avgRating: 6.4 });

describe("statusScore", () => {
  it("maps market value on a log scale between €1m and €150m", () => {
    expect(statusScore(1 * M)).toBe(0);
    expect(statusScore(150 * M)).toBe(1);
    expect(statusScore(300 * M)).toBe(1);
    expect(statusScore(12 * M)).toBeCloseTo(0.5, 1);
    expect(statusScore(70 * M)).toBeGreaterThan(statusScore(10 * M));
  });

  it("falls back to a typical squad player when the value is unknown", () => {
    expect(statusScore(null)).toBe(UNKNOWN_STATUS);
    expect(statusScore(0)).toBe(UNKNOWN_STATUS);
  });
});

describe("priceFor", () => {
  it("stays inside each position's band in 0.5 steps", () => {
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      for (const [f, v] of [
        [EMPTY_FORM, null],
        [bench, 0.5 * M],
        [hot, 250 * M],
      ] as const) {
        const p = priceFor(pos, f, v);
        expect(p).toBeGreaterThanOrEqual(PRICE_BANDS[pos].min);
        expect(p).toBeLessThanOrEqual(PRICE_BANDS[pos].max);
        expect(p * 2).toBe(Math.round(p * 2));
      }
    }
  });

  it("keeps a star expensive through a quiet patch (the Raphinha case)", () => {
    expect(priceFor("FWD", quiet, 70 * M)).toBeGreaterThanOrEqual(10);
  });

  it("prices a world-class player in form at the top", () => {
    expect(priceFor("MID", hot, 200 * M)).toBe(PRICE_BANDS.MID.max);
  });

  it("does not let a small-club player on a hot streak overtake a quiet star", () => {
    expect(priceFor("FWD", hot, 5 * M)).toBeLessThan(priceFor("FWD", quiet, 70 * M));
  });

  it("still rewards form among similar players", () => {
    expect(priceFor("MID", hot, 20 * M)).toBeGreaterThan(priceFor("MID", bench, 20 * M));
  });

  it("prices unused squad players near the bottom", () => {
    expect(priceFor("DEF", bench, 2 * M)).toBeLessThanOrEqual(8);
  });

  it("keeps working from form alone when the market value is unknown", () => {
    expect(priceFor("FWD", hot)).toBeGreaterThan(priceFor("FWD", bench));
  });

  it("ignores goal involvement for goalkeepers", () => {
    const base = form({ apps: 5, starts: 5, minutes: 450, avgRating: 7.0 });
    expect(formScore("GK", { ...base, assists: 3 })).toBe(formScore("GK", base));
  });
});

describe("budget balance (100 credits for 11, max 7 from one team)", () => {
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
  const cost = (picks: [Position, PlayerForm, number][]) =>
    picks.reduce((sum, [pos, f, v]) => sum + priceFor(pos, f, v), 0);

  it("prices 7 big-club starters + 4 small-club starters around the budget", () => {
    // Barça-like starters (€30-80m) for the first 7, small-club starters (€5m) for the rest.
    const values = [40, 50, 60, 35, 30, 80, 70, 5, 5, 5, 5].map((v) => v * M);
    const total = cost(shape.map((p, i) => [p, starter, values[i]!]));
    expect(total).toBeGreaterThanOrEqual(TEAM_RULES.budget - 6);
    expect(total).toBeLessThanOrEqual(TEAM_RULES.budget + 4);
  });

  it("puts a team of in-form stars out of reach", () => {
    expect(cost(shape.map((p) => [p, hot, 120 * M]))).toBeGreaterThan(TEAM_RULES.budget + 8);
  });

  it("leaves room with value picks", () => {
    expect(cost(shape.map((p) => [p, bench, 2 * M]))).toBeLessThan(TEAM_RULES.budget - 10);
  });
});
