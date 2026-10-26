import { describe, expect, it } from "vitest";

import { EMPTY_FORM, formScore, priceFor, PRICE_BANDS, type PlayerForm } from "./pricing";
import { TEAM_RULES } from "./scoring/rules";
import type { Position } from "./types";

const form = (f: Partial<PlayerForm>): PlayerForm => ({ ...EMPTY_FORM, matches: 3, ...f });

/** A typical regular starter (ratings/output in line with real 2026/27 LaLiga data). */
const regular: Record<Position, PlayerForm> = {
  GK: form({ apps: 3, starts: 3, minutes: 270, avgRating: 6.7 }),
  DEF: form({ apps: 3, starts: 3, minutes: 250, avgRating: 6.6 }),
  MID: form({ apps: 3, starts: 3, minutes: 230, avgRating: 6.8, assists: 1 }),
  FWD: form({ apps: 3, starts: 3, minutes: 200, avgRating: 6.8, goals: 1 }),
};

/** A star: every minute, top ratings, a goal involvement (or more) per match. */
const star: Record<Position, PlayerForm> = {
  GK: form({ apps: 3, starts: 3, minutes: 270, avgRating: 7.9 }),
  DEF: form({ apps: 3, starts: 3, minutes: 270, avgRating: 7.6, goals: 1, assists: 1 }),
  MID: form({ apps: 3, starts: 3, minutes: 270, avgRating: 7.9, goals: 2, assists: 2 }),
  FWD: form({ apps: 3, starts: 3, minutes: 270, avgRating: 8.0, goals: 3, assists: 1 }),
};

/** A fringe player: a couple of short sub appearances. */
const fringe: PlayerForm = form({ apps: 2, starts: 0, minutes: 30, avgRating: 6.5 });

describe("priceFor", () => {
  it("stays inside each position's band and uses 0.5 steps", () => {
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      for (const f of [EMPTY_FORM, fringe, regular[pos], star[pos]]) {
        const p = priceFor(pos, f);
        expect(p).toBeGreaterThanOrEqual(PRICE_BANDS[pos].min);
        expect(p).toBeLessThanOrEqual(PRICE_BANDS[pos].max);
        expect(p * 2).toBe(Math.round(p * 2));
      }
    }
  });

  it("orders fringe < regular < star for every position", () => {
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      expect(priceFor(pos, fringe)).toBeLessThan(priceFor(pos, regular[pos]));
      expect(priceFor(pos, regular[pos])).toBeLessThan(priceFor(pos, star[pos]));
    }
  });

  it("prices players with no recent data near the bottom of the band", () => {
    expect(priceFor("FWD", EMPTY_FORM)).toBe(8);
    expect(priceFor("GK", EMPTY_FORM)).toBe(6);
  });

  it("rewards goals and assists more for attackers than defenders", () => {
    const quiet = form({ apps: 3, starts: 3, minutes: 270, avgRating: 7.0 });
    const scorer = { ...quiet, goals: 2 };
    const fwdGain = priceFor("FWD", scorer) - priceFor("FWD", quiet);
    const defGain = priceFor("DEF", scorer) - priceFor("DEF", quiet);
    expect(fwdGain).toBeGreaterThan(defGain);
  });

  it("ignores goal involvement for goalkeepers", () => {
    const base = form({ apps: 3, starts: 3, minutes: 270, avgRating: 7.0 });
    expect(priceFor("GK", { ...base, assists: 3 })).toBe(priceFor("GK", base));
  });

  it("caps the form score at 1", () => {
    const absurd = form({ apps: 3, starts: 3, minutes: 400, avgRating: 10, goals: 9, assists: 9 });
    expect(formScore("FWD", absurd)).toBe(1);
    expect(priceFor("FWD", absurd)).toBe(PRICE_BANDS.FWD.max);
  });

  describe("budget balance (100 credits for 11)", () => {
    const cost = (picks: [Position, PlayerForm][]) =>
      picks.reduce((sum, [pos, f]) => sum + priceFor(pos, f), 0);
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

    it("prices a typical XI of regular starters right around the budget", () => {
      const total = cost(shape.map((p) => [p, regular[p]]));
      expect(total).toBeGreaterThanOrEqual(TEAM_RULES.budget - 10);
      expect(total).toBeLessThanOrEqual(TEAM_RULES.budget + 5);
    });

    it("puts a team of stars far out of reach", () => {
      expect(cost(shape.map((p) => [p, star[p]]))).toBeGreaterThan(TEAM_RULES.budget + 15);
    });

    it("leaves plenty of room with value picks", () => {
      expect(cost(shape.map((p) => [p, fringe]))).toBeLessThan(TEAM_RULES.budget - 25);
    });

    it("forces a trade-off: 4 stars + 7 regulars is over budget", () => {
      const picks: [Position, PlayerForm][] = shape.map((p, i) => [
        p,
        i >= 7 ? star[p] : regular[p], // 2 MID stars + 2 FWD stars
      ]);
      expect(cost(picks)).toBeGreaterThan(TEAM_RULES.budget);
    });
  });
});
