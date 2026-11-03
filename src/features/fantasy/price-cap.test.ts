import { describe, expect, it } from "vitest";

import { capDiscount, cappedPrice, maxTeamCost, type PoolPlayer } from "./price-cap";
import type { Position } from "./types";

let id = 0;
const make = (team: number, position: Position, prices: number[], locked = false): PoolPlayer[] =>
  prices.map((price) => ({ id: ++id, team, position, price, locked }));

// Two clubs with plenty of players, Barça (1) pricier than the opponent (2).
const pool = [
  ...make(1, "GK", [8.5, 7.5]),
  ...make(1, "DEF", [8.5, 8, 8, 8, 8]),
  ...make(1, "MID", [10.5, 10, 10, 9.5, 9]),
  ...make(1, "FWD", [11.5, 11, 10.5]),
  ...make(2, "GK", [8.5, 7]),
  ...make(2, "DEF", [8, 8, 8, 8, 8]),
  ...make(2, "MID", [10, 9.5, 9.5, 9]),
  ...make(2, "FWD", [10.5, 10]),
];

describe("price cap", () => {
  it("finds the priciest legal XI with at most 7 per club", () => {
    // 3-4-3: Barça GK, DEF, 3 MID, 2 FWD = 7; opponent 2 DEF, 1 MID, 1 FWD.
    expect(maxTeamCost(pool)).toBe(106.5);
    // With a 3-per-club limit no legal XI exists between two clubs.
    expect(maxTeamCost(pool, 3)).toBe(0);
  });

  it("returns 0 when no legal XI exists", () => {
    expect(maxTeamCost(make(1, "FWD", [10, 10]))).toBe(0);
    expect(maxTeamCost([])).toBe(0); // a match whose squads aren't synced yet
  });

  it("drops every price by the same step until the XI fits the cap", () => {
    expect(capDiscount(pool, 103)).toBe(0.5); // 106.5 - 11 × 0.5 = 101
    expect(capDiscount(pool, 110)).toBe(0);
    const after = pool.map((p) => ({ ...p, price: cappedPrice(p, 0.5) }));
    expect(maxTeamCost(after)).toBeLessThanOrEqual(103);
  });

  it("never discounts locked prices or goes below the floor", () => {
    expect(cappedPrice({ id: 1, team: 1, position: "MID", price: 9, locked: true }, 1)).toBe(9);
    expect(cappedPrice({ id: 1, team: 1, position: "GK", price: 5.5, locked: false }, 1)).toBe(5);
  });
});
