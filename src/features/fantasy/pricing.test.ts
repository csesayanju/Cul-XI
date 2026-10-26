import { describe, expect, it } from "vitest";

import {
  EMPTY_FORM,
  formScore,
  priceFor,
  priceScore,
  PRICE_BANDS,
  seasonScore,
  statusScore,
  UNKNOWN_STATUS,
  type PlayerForm,
  type PriceInputs,
  type SeasonStats,
} from "./pricing";
import { TEAM_RULES } from "./scoring/rules";
import type { Position } from "./types";

const M = 1_000_000;
const form = (f: Partial<PlayerForm>): PlayerForm => ({ ...EMPTY_FORM, matches: 5, ...f });
const season = (s: Partial<SeasonStats>): SeasonStats => ({
  season: "26/27",
  games: 12,
  minutes: 1000,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  teamGames: 12,
  ...s,
});

/** A regular starter's last 30 days. */
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

describe("seasonScore", () => {
  it("rewards minutes share and goal involvement for attackers", () => {
    const star = season({ games: 11, minutes: 921, goals: 9, assists: 10 });
    const sub = season({ games: 6, minutes: 150, goals: 0, assists: 0 });
    expect(seasonScore("FWD", star)!).toBeGreaterThan(0.8);
    expect(seasonScore("FWD", sub)!).toBeLessThan(0.2);
  });

  it("rewards clean sheets for goalkeepers and defenders", () => {
    const tight = season({ games: 12, minutes: 1080, cleanSheets: 6 });
    const leaky = season({ games: 12, minutes: 1080, cleanSheets: 0 });
    expect(seasonScore("GK", tight)!).toBeGreaterThan(seasonScore("GK", leaky)!);
    expect(seasonScore("FWD", tight)).toBe(seasonScore("FWD", leaky));
  });

  it("is null when there is no season data yet", () => {
    expect(seasonScore("MID", null)).toBeNull();
    expect(seasonScore("MID", season({ games: 0 }))).toBeNull();
  });
});

describe("priceFor", () => {
  const all = (f: PlayerForm, v: number | null, s?: SeasonStats): PriceInputs => ({
    form: f,
    last: f,
    marketValue: v,
    season: s,
  });

  it("stays inside each position's band in 0.5 steps", () => {
    for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
      for (const inputs of [
        {},
        all(bench, 0.5 * M),
        all(hot, 250 * M, season({ goals: 30, assists: 30, cleanSheets: 12, minutes: 1080 })),
      ]) {
        const p = priceFor(pos, inputs);
        expect(p).toBeGreaterThanOrEqual(PRICE_BANDS[pos].min);
        expect(p).toBeLessThanOrEqual(PRICE_BANDS[pos].max);
        expect(p * 2).toBe(Math.round(p * 2));
      }
    }
  });

  it("keeps a star expensive through a quiet patch (the Raphinha case)", () => {
    const strongSeason = season({ games: 9, minutes: 600, goals: 4, assists: 3 });
    expect(priceFor("FWD", { ...all(quiet, 70 * M, strongSeason) })).toBeGreaterThanOrEqual(10);
  });

  it("prices a world-class player in form at the top", () => {
    const s = season({ games: 11, minutes: 921, goals: 9, assists: 10 });
    expect(priceFor("MID", all(hot, 200 * M, s))).toBe(PRICE_BANDS.MID.max);
  });

  it("does not let a small-club player on a hot streak overtake a quiet star", () => {
    expect(priceFor("FWD", all(hot, 5 * M))).toBeLessThan(
      priceFor("FWD", all(quiet, 70 * M, season({ games: 9, minutes: 600, goals: 4 }))),
    );
  });

  it("uses season stats: a strong season beats a weak one at equal value and form", () => {
    const strong = season({ games: 12, minutes: 1000, goals: 7, assists: 4 });
    const weak = season({ games: 12, minutes: 300, goals: 0, assists: 0 });
    expect(priceScore("FWD", all(starter, 20 * M, strong))).toBeGreaterThan(
      priceScore("FWD", all(starter, 20 * M, weak)),
    );
  });

  it("uses the last match: a big last game nudges the price up", () => {
    const bigLast = form({ matches: 1, apps: 1, starts: 1, minutes: 90, avgRating: 8.5, goals: 2 });
    const quietLast = form({ matches: 1, apps: 1, starts: 0, minutes: 10, avgRating: 6.2 });
    const base = { form: starter, marketValue: 20 * M };
    expect(priceScore("FWD", { ...base, last: bigLast })).toBeGreaterThan(
      priceScore("FWD", { ...base, last: quietLast }),
    );
  });

  it("still rewards form among similar players", () => {
    expect(priceFor("MID", all(hot, 20 * M))).toBeGreaterThan(priceFor("MID", all(bench, 20 * M)));
  });

  it("prices unused squad players near the bottom", () => {
    expect(priceFor("DEF", all(bench, 2 * M))).toBeLessThanOrEqual(8);
  });

  it("works from form alone when nothing else is known", () => {
    expect(priceFor("FWD", { form: hot })).toBeGreaterThan(priceFor("FWD", { form: bench }));
  });

  it("ignores goal involvement for goalkeepers in form", () => {
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
  const regularSeason = season({ games: 12, minutes: 900, goals: 2, assists: 2, cleanSheets: 4 });
  const cost = (picks: [Position, PriceInputs][]) =>
    picks.reduce((sum, [pos, inputs]) => sum + priceFor(pos, inputs), 0);

  it("prices 7 big-club starters + 4 small-club starters around the budget", () => {
    const values = [40, 50, 60, 35, 30, 80, 70, 5, 5, 5, 5].map((v) => v * M);
    const total = cost(
      shape.map((p, i) => [
        p,
        { form: starter, last: starter, season: regularSeason, marketValue: values[i]! },
      ]),
    );
    expect(total).toBeGreaterThanOrEqual(TEAM_RULES.budget - 6);
    expect(total).toBeLessThanOrEqual(TEAM_RULES.budget + 4);
  });

  it("puts a team of in-form stars out of reach", () => {
    const starSeason = season({ games: 12, minutes: 1050, goals: 8, assists: 6, cleanSheets: 7 });
    expect(
      cost(
        shape.map((p) => [p, { form: hot, last: hot, season: starSeason, marketValue: 120 * M }]),
      ),
    ).toBeGreaterThan(TEAM_RULES.budget + 8);
  });

  it("leaves room with value picks", () => {
    const fringeSeason = season({ games: 4, minutes: 120 });
    expect(
      cost(
        shape.map((p) => [
          p,
          { form: bench, last: bench, season: fringeSeason, marketValue: 2 * M },
        ]),
      ),
    ).toBeLessThan(TEAM_RULES.budget - 10);
  });
});
