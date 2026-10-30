import { describe, expect, it } from "vitest";

import {
  applyCareerGuess,
  CAREER_GUESSES,
  daySeed,
  isPlayable,
  NEW_CAREER,
  normaliseCareer,
  pickCareerPlayer,
  unlockedHints,
} from "./career";

describe("normaliseCareer", () => {
  it("orders spells, drops national teams and merges back-to-back spells", () => {
    const career = normaliseCareer([
      { clubId: "Q2", clubName: "AC Milan", from: 2010, to: 2010 },
      { clubId: "Q1", clubName: "Manchester United F.C.", from: 1992, to: 2003 },
      { clubId: "Q9", clubName: "England national football team", from: 1996, to: 2009 },
      { clubId: "Q2", clubName: "AC Milan", from: 2009, to: 2009 },
      { clubId: "Q3", clubName: "LA Galaxy", from: 2007, to: 2012 },
    ]);
    expect(career.map((s) => `${s.clubName} ${s.from}-${s.to}`)).toEqual([
      "Manchester United F.C. 1992-2003",
      "LA Galaxy 2007-2012",
      "AC Milan 2009-2010",
    ]);
  });

  it("keeps an open-ended current spell open", () => {
    const career = normaliseCareer([
      { clubId: "Q1", clubName: "Club A", from: 2020, to: 2022 },
      { clubId: "Q1", clubName: "Club A", from: 2022, to: null },
    ]);
    expect(career).toEqual([{ clubId: "Q1", clubName: "Club A", from: 2020, to: null }]);
  });
});

describe("isPlayable", () => {
  const spell = (from: number | null) => ({ clubId: `Q${from}`, clubName: "X", from, to: null });
  it("needs 4+ spells, all dated", () => {
    expect(isPlayable([spell(1), spell(2), spell(3)])).toBe(false);
    expect(isPlayable([spell(1), spell(2), spell(3), spell(4)])).toBe(true);
    expect(isPlayable([spell(1), spell(2), spell(3), spell(null)])).toBe(false);
  });
});

describe("applyCareerGuess", () => {
  it("solves on the right player, ends after 5 wrong guesses, ignores repeats", () => {
    expect(applyCareerGuess(NEW_CAREER, 7, 7).state).toMatchObject({
      solved: true,
      finished: true,
    });
    let s = NEW_CAREER;
    for (let i = 1; i <= CAREER_GUESSES; i++) s = applyCareerGuess(s, 99, i).state;
    expect(s).toMatchObject({ solved: false, finished: true });
    const one = applyCareerGuess(NEW_CAREER, 99, 1).state;
    expect(applyCareerGuess(one, 99, 1).outcome.kind).toBe("repeat");
  });
});

describe("unlockedHints", () => {
  const p = {
    nationality: "Spain",
    countryCode: "ES",
    position: "MID",
    birthYear: 1980,
    name: "xavi",
  };
  it("unlocks one hint per wrong guess, all when finished", () => {
    expect(unlockedHints(0, false, p)).toEqual({});
    expect(Object.keys(unlockedHints(2, false, p))).toEqual(["nationality", "position"]);
    expect(unlockedHints(0, true, p).initial).toBe("X");
  });
});

describe("pickCareerPlayer", () => {
  it("is deterministic per day and avoids recent players", () => {
    const seed = daySeed("2026-10-31");
    expect(pickCareerPlayer([1, 2, 3], new Set(), seed)).toBe(
      pickCareerPlayer([1, 2, 3], new Set(), seed),
    );
    expect(pickCareerPlayer([1, 2, 3], new Set([1, 2]), seed)).toBe(3);
    expect(pickCareerPlayer([], new Set(), seed)).toBeNull();
  });
});
