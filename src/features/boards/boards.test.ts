import { describe, expect, it } from "vitest";

import { addDays, archiveDays, isArchiveDay, parsePeriod, periodStart } from "./period";
import { DAILY_GAMES, tallyDaily, tallyEndless } from "./scores";

describe("period", () => {
  it("lists the last 15 days, newest first, never today", () => {
    const days = archiveDays("2026-11-03");
    expect(days).toHaveLength(15);
    expect(days[0]).toBe("2026-11-02");
    expect(days.at(-1)).toBe("2026-10-19");
    expect(isArchiveDay("2026-11-03", "2026-11-03")).toBe(false);
    expect(isArchiveDay("2026-10-19", "2026-11-03")).toBe(true);
    expect(isArchiveDay("2026-10-18", "2026-11-03")).toBe(false);
    expect(isArchiveDay("garbage", "2026-11-03")).toBe(false);
  });

  it("starts weeks on Monday and months on the 1st", () => {
    expect(periodStart("week", "2026-11-03")).toBe("2026-11-02"); // Tuesday -> Monday
    expect(periodStart("week", "2026-11-02")).toBe("2026-11-02");
    expect(periodStart("week", "2026-11-08")).toBe("2026-11-02"); // Sunday
    expect(periodStart("month", "2026-11-03")).toBe("2026-11-01");
    expect(periodStart("day", "2026-11-03")).toBe("2026-11-03");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(parsePeriod("week")).toBe("week");
    expect(parsePeriod("nope")).toBe("day");
  });
});

describe("scores", () => {
  it("scores each game", () => {
    expect(DAILY_GAMES["cule-ten"].score({ found: 7 })).toBe(7);
    expect(DAILY_GAMES.mystery.score({ solved: true, guesses: [1, 2, 3] })).toBe(6);
    expect(DAILY_GAMES.mystery.score({ solved: false, guesses: [1] })).toBe(0);
    expect(DAILY_GAMES.career.score({ solved: true, guesses: [1] })).toBe(5);
    expect(DAILY_GAMES.connections.score({ solved: [0, 1, 2, 3], mistakes: 1 })).toBe(7);
    expect(DAILY_GAMES.connections.score({ solved: [], mistakes: 4 })).toBe(0);
  });

  it("adds up a period and ranks by score, then fewer games", () => {
    const rows = [
      { user_id: "a", found: 5 },
      { user_id: "a", found: 4 },
      { user_id: "b", found: 9 },
      { user_id: "c", found: 3 },
    ];
    expect(tallyDaily(rows, DAILY_GAMES["cule-ten"].score)).toEqual([
      { userId: "b", score: 9, played: 1 },
      { userId: "a", score: 9, played: 2 },
      { userId: "c", score: 3, played: 1 },
    ]);
  });

  it("takes the best streak for endless games", () => {
    expect(
      tallyEndless([
        { user_id: "a", best: 3 },
        { user_id: "a", best: 8 },
        { user_id: "b", best: 0 },
      ]),
    ).toEqual([{ userId: "a", score: 8, played: 2 }]);
  });
});
