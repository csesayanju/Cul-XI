import { describe, expect, it } from "vitest";

import {
  allClues,
  applySeasonGuess,
  guessHints,
  NEW_SEASON_GAME,
  pickSeason,
  SEASON_GUESSES,
  seasonLabel,
  unlockedClues,
  type SeasonFacts,
} from "./season";

const treble: SeasonFacts = {
  startYear: 2008,
  season: "2008–09",
  played: 38,
  won: 27,
  drawn: 6,
  lost: 5,
  goalsFor: 105,
  goalsAgainst: 35,
  points: 87,
  position: 1,
  copa: "Winners",
  europe: { competition: "Champions League", result: "Winners" },
  topScorers: ["Eto'o"],
  topScorerGoals: 30,
  champion: "Barcelona",
  pichichi: { names: ["Diego Forlán"], clubs: ["Atlético Madrid"], goals: 32 },
};

const valid = new Set([1990, 2000, 2005, 2006, 2007, 2008, 2009, 2010, 2015]);

describe("Which Season?", () => {
  it("labels seasons", () => {
    expect(seasonLabel(2008)).toBe("2008–09");
    expect(seasonLabel(1999)).toBe("1999–00");
  });

  it("builds six clues, hardest first", () => {
    const clues = allClues(treble);
    expect(clues.map((c) => c.label)).toEqual([
      "League record",
      "League finish",
      "Copa del Rey",
      "Europe",
      "Pichichi",
      "Barça top scorer",
    ]);
    expect(clues[0]!.value).toBe("W27 D6 L5 · 105 scored, 35 conceded");
    expect(clues[1]!.value).toBe("1st of the table, 87 pts");
    expect(clues[4]!.value).toBe("Diego Forlán (Atlético Madrid) · 32 goals");
    expect(allClues({ ...treble, position: 2, champion: "Real Madrid" })[1]!.value).toBe(
      "2nd of the table, 87 pts · champions: Real Madrid",
    );
    expect(allClues({ ...treble, europe: null, copa: null })[2]!.value).toBe("Didn't take part");
  });

  it("unlocks a clue per miss and all at the end", () => {
    expect(unlockedClues(treble, NEW_SEASON_GAME)).toHaveLength(1);
    expect(unlockedClues(treble, { ...NEW_SEASON_GAME, guesses: [2000, 2010] })).toHaveLength(3);
    expect(unlockedClues(treble, { guesses: [2008], solved: true, finished: true })).toHaveLength(
      6,
    );
  });

  it("checks guesses, says earlier or later, and ends after six", () => {
    let r = applySeasonGuess(NEW_SEASON_GAME, 2008, 2010, valid);
    expect(r.outcome).toEqual({ kind: "wrong", direction: "earlier", off: 2 });
    r = applySeasonGuess(r.state, 2008, 2010, valid);
    expect(r.outcome.kind).toBe("repeat");
    expect(applySeasonGuess(r.state, 2008, 1850, valid).outcome.kind).toBe("invalid");
    r = applySeasonGuess(r.state, 2008, 2000, valid);
    expect(r.outcome).toEqual({ kind: "wrong", direction: "later", off: 8 });
    r = applySeasonGuess(r.state, 2008, 2008, valid);
    expect(r.state).toEqual({ guesses: [2010, 2000, 2008], solved: true, finished: true });
    expect(applySeasonGuess(r.state, 2008, 2009, valid).outcome.kind).toBe("over");

    let s = NEW_SEASON_GAME;
    for (const g of [1990, 2000, 2005, 2006, 2007, 2009])
      s = applySeasonGuess(s, 2008, g, valid).state;
    expect(s.guesses).toHaveLength(SEASON_GUESSES);
    expect(s).toMatchObject({ solved: false, finished: true });
  });

  it("marks guesses as right, earlier, later or close", () => {
    expect(guessHints([2010, 2000, 2008], 2008)).toEqual([
      { startYear: 2010, season: "2010–11", result: "earlier", close: true },
      { startYear: 2000, season: "2000–01", result: "later", close: false },
      { startYear: 2008, season: "2008–09", result: "right", close: false },
    ]);
  });

  it("picks a season not used recently", () => {
    expect(pickSeason([2000, 2001, 2002], new Set([2000, 2001]), 7)).toBe(2002);
    expect(pickSeason([2000], new Set([2000]), 3)).toBe(2000);
    expect(pickSeason([], new Set(), 1)).toBeNull();
  });
});
