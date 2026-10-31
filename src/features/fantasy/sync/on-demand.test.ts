import { describe, expect, it } from "vitest";

import { freshenNeed } from "./on-demand";

const ko = Date.parse("2026-10-31T20:00:00Z");
const min = 60_000;
const m = (over: Partial<Parameters<typeof freshenNeed>[0]> = {}) => ({
  id: 1,
  kickoff_at: "2026-10-31T20:00:00Z",
  status: "NS",
  lineups_synced_at: null,
  stats_synced_at: null,
  ...over,
});

describe("freshenNeed", () => {
  it("wants line-ups from an hour before kickoff until they're in", () => {
    expect(freshenNeed(m(), ko - 90 * min)).toBeNull();
    expect(freshenNeed(m(), ko - 40 * min)).toBe("lineups");
    expect(freshenNeed(m({ lineups_synced_at: "x" }), ko - 40 * min)).toBeNull();
  });

  it("wants live points during the match", () => {
    const done = { lineups_synced_at: "x" };
    expect(freshenNeed(m(done), ko + 2 * min)).toBeNull();
    expect(freshenNeed(m(done), ko + 30 * min)).toBe("live");
    expect(freshenNeed(m(done), ko + 110 * min)).toBe("live");
  });

  it("wants final stats from two hours after kickoff for two days", () => {
    const done = { lineups_synced_at: "x" };
    expect(freshenNeed(m(done), ko + 150 * min)).toBe("stats");
    expect(freshenNeed(m({ ...done, stats_synced_at: "x" }), ko + 150 * min)).toBeNull();
    expect(freshenNeed(m(done), ko + 50 * 60 * min)).toBeNull();
  });

  it("leaves postponed or cancelled matches alone", () => {
    expect(freshenNeed(m({ status: "PST" }), ko - 30 * min)).toBeNull();
  });
});
