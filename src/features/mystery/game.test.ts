import { describe, expect, it } from "vitest";

import {
  applyMysteryGuess,
  compare,
  MYSTERY_GUESSES,
  NEW_MYSTERY,
  type MysteryPlayer,
} from "./game";

const player = (over: Partial<MysteryPlayer>): MysteryPlayer => ({
  id: 1,
  name: "X",
  countryCode: "ES",
  nationality: "Spain",
  position: "MID",
  birthYear: 1990,
  clubs: new Map([["Q7156", "Barcelona"]]),
  barca: true,
  ...over,
});

describe("compare", () => {
  const answer = player({
    id: 99,
    birthYear: 1987,
    clubs: new Map([
      ["Q7156", "Barcelona"],
      ["Q1", "Valencia"],
    ]),
  });

  it("marks matches, birth direction and shared clubs", () => {
    const clue = compare(
      player({
        id: 2,
        countryCode: "AR",
        nationality: "Argentina",
        birthYear: 1985,
        clubs: new Map([
          ["Q1", "Valencia"],
          ["Q2", "Inter"],
        ]),
        barca: false,
      }),
      answer,
    );
    expect(clue.nation.hit).toBe("no");
    expect(clue.position.hit).toBe("yes");
    expect(clue.born).toMatchObject({ hit: "no", arrow: "up", close: true });
    expect(clue.shared).toEqual({ clubs: ["Valencia"], hit: "yes" });
    expect(clue.barca.hit).toBe("no");
    expect(clue.correct).toBe(false);
  });

  it("is all green for the answer itself", () => {
    const clue = compare(answer, answer);
    expect(clue.correct).toBe(true);
    expect(clue.born).toMatchObject({ hit: "yes", arrow: null });
  });

  it("says unknown when data is missing", () => {
    const clue = compare(player({ id: 3, position: null, birthYear: null }), answer);
    expect(clue.position.hit).toBe("unknown");
    expect(clue.born.hit).toBe("unknown");
  });
});

describe("applyMysteryGuess", () => {
  it("solves, ignores repeats and ends after 8 guesses", () => {
    expect(applyMysteryGuess(NEW_MYSTERY, 5, 5).state).toMatchObject({
      solved: true,
      finished: true,
    });
    const one = applyMysteryGuess(NEW_MYSTERY, 5, 1).state;
    expect(applyMysteryGuess(one, 5, 1).outcome.kind).toBe("repeat");
    let s = NEW_MYSTERY;
    for (let i = 1; i <= MYSTERY_GUESSES; i++) s = applyMysteryGuess(s, 999, i).state;
    expect(s).toMatchObject({ solved: false, finished: true });
  });
});
