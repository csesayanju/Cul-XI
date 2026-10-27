import { describe, expect, it } from "vitest";

import { matchPlayer, type MatchCandidate } from "./matching";

const c = (id: number, ...variants: string[]): MatchCandidate => ({ id, variants, apps: 0 });
const repo = [
  c(1, "frenkie de jong", "frenkie"),
  c(2, "fermin lopez", "fermin lopez marin"),
  c(3, "pau cubarsi"),
  c(4, "jules kounde"),
  c(5, "pedri", "pedro gonzalez lopez"),
  c(6, "luuk de jong"),
];

describe("matchPlayer", () => {
  it.each([
    [["F. de Jong", "Frenkie de Jong"], 1],
    [["Fermín", "Fermín López Martín"], 2],
    [["Pau Cubarsí Paredes"], 3],
    [["J. Koundé", "Jules Olivier Koundé"], 4],
    [["Pedri", "Pedro González López"], 5],
  ])("%j -> %i", (names, id) => {
    expect(matchPlayer(names, repo)?.id).toBe(id);
  });

  it("doesn't confuse players who only share a surname", () => {
    expect(matchPlayer(["L. de Jong"], repo)?.id).toBe(6);
    expect(matchPlayer(["M. de Jong"], repo)).toBeNull();
  });

  it("returns null when nobody matches", () => {
    expect(matchPlayer(["O. Goren"], repo)).toBeNull();
  });

  it("prefers the most-capped candidate when several match", () => {
    const twins = [
      { ...c(10, "jordi alba"), apps: 300 },
      { ...c(11, "jordi alba"), apps: 3 },
    ];
    expect(matchPlayer(["Jordi Alba"], twins)?.id).toBe(10);
  });
});
