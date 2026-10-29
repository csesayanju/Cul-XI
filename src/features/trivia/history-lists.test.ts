import { describe, expect, it } from "vitest";

import type { HistoryPlayer, PersonRef, RecordRow, StaffRow } from "@/lib/wikipedia/barca-history";

import { eraOf, finalise, historyLists, type HistorySources } from "./history-lists";

const ref = (name: string): PersonRef => ({ name, title: name });
const ids = new Map<string, number>();
const resolve = (p: PersonRef) => {
  if (!p.title || p.title.startsWith("Unknown")) return null;
  if (!ids.has(p.title)) ids.set(p.title, ids.size + 1);
  return ids.get(p.title)!;
};
const rows = (values: number[], prefix = "P") =>
  values.map((value, i) => ({ person: ref(`${prefix}${i}`), value, label: `${value}`, era: null }));

describe("eraOf", () => {
  it("names decades", () => {
    expect(eraOf(1994, 2006)).toBe("1990s–2000s");
    expect(eraOf(2001, 2008)).toBe("2000s");
    expect(eraOf(2015, null)).toBe("2010s");
    expect(eraOf(null, 2000)).toBeNull();
  });
});

describe("finalise", () => {
  it("passes a clean top 10", () => {
    const l = finalise("k", "t", "s", rows([10, 9, 8, 8, 7, 6, 5, 4, 3, 2, 1]), resolve);
    expect(l.problems).toEqual([]);
    expect(l.entries).toHaveLength(10);
  });

  it("flags short lists, ties for 10th, bad order, unmatched and repeated people", () => {
    expect(finalise("k", "t", "s", rows([3, 2, 1]), resolve).problems[0]).toMatch(/only 3/);
    expect(
      finalise("k", "t", "s", rows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1]), resolve).problems[0],
    ).toMatch(/tie for 10th/);
    expect(
      finalise("k", "t", "s", rows([10, 9, 8, 7, 6, 50, 4, 3, 2, 1]), resolve).problems[0],
    ).toMatch(/not in order/);

    const unmatched = rows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    unmatched[4]!.person = { name: "Unknown", title: null };
    const u = finalise("k", "t", "s", unmatched, resolve);
    expect(u.problems).toEqual(["unmatched: Unknown"]);
    expect(u.entries).toHaveLength(9);

    const twice = rows([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    twice[3]!.person = twice[0]!.person;
    expect(finalise("k", "t", "s", twice, resolve).problems).toEqual(["listed twice: P0"]);
  });
});

describe("historyLists", () => {
  const player = (i: number, over: Partial<HistoryPlayer> = {}): HistoryPlayer => ({
    person: ref(`Player ${i}`),
    nationality: i % 2 ? "Brazil" : "Spain",
    position: "Forward",
    from: 1990 + i,
    to: 1995 + i,
    captain: i < 12,
    leagueApps: 300 - i * 10,
    leagueGoals: 200 - i * 7,
    ...over,
  });
  const record = (i: number, value: number): RecordRow => ({
    person: ref(`Player ${i}`),
    nationality: null,
    years: "1990–2000",
    value,
    note: "2019",
  });
  const staff = (name: string, from: number, to: number | null, honours: number): StaffRow => ({
    person: ref(name),
    nationality: null,
    from: { year: from, month: 7 },
    to: to == null ? null : { year: to, month: 7 },
    honours,
  });
  const top = Array.from({ length: 10 }, (_, i) => record(i, 100 - i));
  const src: HistorySources = {
    players: Array.from({ length: 24 }, (_, i) => player(i)),
    records: {
      appsAll: top,
      goalsAll: top,
      goalsEurope: top,
      goalsLiga: top,
      goalsCopa: top,
      signings: top,
      sales: top,
    },
    seasons: [],
    managers: [
      ...Array.from({ length: 11 }, (_, i) =>
        staff(`Manager ${i}`, 1850 + i * 13, 1862 + i * 12, 11 - i),
      ),
      staff("Manager 0", 2010, 2014, 5), // a second spell adds up
    ],
    presidents: [],
  };
  const lists = historyLists(src, resolve, new Date("2026-10-29T00:00:00Z"));
  const byKey = new Map(lists.map((l) => [l.key, l]));

  it("builds record lists with era hints", () => {
    const apps = byKey.get("wp:apps")!;
    expect(apps.problems).toEqual([]);
    expect(apps.entries[0]).toMatchObject({ statLabel: "100 apps", era: "1990s–2000s" });
    expect(byKey.get("wp:signings")!.entries[0]!.statLabel).toBe("€100m (2019)");
  });

  it("skips lists with fewer than 10 qualifying players", () => {
    expect(byKey.has("wp:nation:brazil:apps")).toBe(true);
    expect(byKey.has("wp:pos:goalkeepers:apps")).toBe(false);
  });

  it("adds up a manager's spells", () => {
    const tenure = byKey.get("wp:managers:tenure")!;
    expect(tenure.problems).toEqual([]);
    expect(tenure.entries[0]!.statLabel).toBe("16 years");
    expect(byKey.get("wp:managers:honours")!.entries[0]!.statLabel).toBe("16 trophies");
  });
});
