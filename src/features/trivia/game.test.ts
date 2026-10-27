import { describe, expect, it } from "vitest";

import {
  applyGuess,
  flagEmoji,
  LIVES,
  NEW_ATTEMPT,
  pickDailyList,
  publicView,
  streak,
  triviaDay,
  type TriviaEntry,
} from "./game";

const entries: TriviaEntry[] = Array.from({ length: 10 }, (_, i) => ({
  rank: i + 1,
  playerId: 100 + i,
  name: `Player ${i + 1}`,
  nationality: i % 2 ? "Spain" : "Brazil",
  countryCode: i % 2 ? "ES" : "BR",
  statLabel: `${20 - i} goals`,
}));

describe("applyGuess", () => {
  it("reveals the rank of a correct guess", () => {
    const { state, outcome } = applyGuess(entries, NEW_ATTEMPT, 103);
    expect(outcome).toEqual({ kind: "correct", rank: 4 });
    expect(state).toMatchObject({ found: 1, livesLeft: LIVES, finished: false });
  });

  it("costs a life for a wrong guess and ends the game at zero lives", () => {
    let s = NEW_ATTEMPT;
    for (const id of [1, 2]) s = applyGuess(entries, s, id).state;
    expect(s).toMatchObject({ livesLeft: 1, finished: false });
    const last = applyGuess(entries, s, 3);
    expect(last.outcome).toEqual({ kind: "wrong" });
    expect(last.state).toMatchObject({ livesLeft: 0, finished: true });
  });

  it("ignores repeated guesses without costing a life", () => {
    const once = applyGuess(entries, NEW_ATTEMPT, 1).state;
    const twice = applyGuess(entries, once, 1);
    expect(twice.outcome).toEqual({ kind: "repeat" });
    expect(twice.state).toBe(once);
  });

  it("finishes when all 10 are found", () => {
    let s = NEW_ATTEMPT;
    for (const e of entries) s = applyGuess(entries, s, e.playerId).state;
    expect(s).toMatchObject({ found: 10, finished: true, livesLeft: LIVES });
    expect(applyGuess(entries, s, 999).outcome).toEqual({ kind: "over" });
  });

  it("does not mutate the previous state", () => {
    const before = { ...NEW_ATTEMPT, guesses: [] };
    applyGuess(entries, before, 100);
    expect(before.guesses).toEqual([]);
  });
});

describe("publicView", () => {
  it("shows hints for every slot but only the answers that were found", () => {
    const s = applyGuess(entries, NEW_ATTEMPT, 104).state;
    const view = publicView(entries, s);
    expect(view).toHaveLength(10);
    expect(view.every((v) => v.hint.nationality)).toBe(true);
    expect(view.filter((v) => v.answer).map((v) => v.rank)).toEqual([5]);
    expect(JSON.stringify(view)).not.toContain('Player 1"');
  });

  it("reveals everything once the game is over, marking what was missed", () => {
    let s = applyGuess(entries, NEW_ATTEMPT, 100).state;
    for (const id of [1, 2, 3]) s = applyGuess(entries, s, id).state;
    const view = publicView(entries, s);
    expect(view.every((v) => v.answer)).toBe(true);
    expect(view[0]!.answer!.found).toBe(true);
    expect(view[1]!.answer!.found).toBe(false);
  });
});

describe("helpers", () => {
  it("turns country codes into flag emoji", () => {
    expect(flagEmoji("ES")).toBe("🇪🇸");
    expect(flagEmoji("br")).toBe("🇧🇷");
    expect(flagEmoji(null)).toBeNull();
    expect(flagEmoji("ESP")).toBeNull();
  });

  it("uses the India calendar day", () => {
    // 20:00 UTC on the 26th is already 01:30 on the 27th in India.
    expect(triviaDay(new Date("2026-10-26T20:00:00Z"))).toBe("2026-10-27");
    expect(triviaDay(new Date("2026-10-26T10:00:00Z"))).toBe("2026-10-26");
  });

  it("counts consecutive days played", () => {
    expect(streak(["2026-10-25", "2026-10-26", "2026-10-27"], "2026-10-27")).toBe(3);
    expect(streak(["2026-10-25", "2026-10-26"], "2026-10-27")).toBe(2); // today not played yet
    expect(streak(["2026-10-24", "2026-10-26"], "2026-10-27")).toBe(1);
    expect(streak([], "2026-10-27")).toBe(0);
  });
});

describe("pickDailyList", () => {
  const lists = [
    { id: "auto-goals", kind: "auto" as const },
    { id: "auto-value", kind: "auto" as const },
    { id: "curated-scorers", kind: "curated" as const },
  ];

  it("prefers an approved curated list that hasn't run recently", () => {
    expect(pickDailyList(lists, new Map(), "2026-10-27")?.id).toBe("curated-scorers");
  });

  it("falls back to the least recently used auto list within 45 days of a curated one", () => {
    const used = new Map([
      ["curated-scorers", "2026-10-20"],
      ["auto-goals", "2026-10-25"],
    ]);
    expect(pickDailyList(lists, used, "2026-10-27")?.id).toBe("auto-value");
  });

  it("returns null when there are no lists", () => {
    expect(pickDailyList([], new Map(), "2026-10-27")).toBeNull();
  });
});
