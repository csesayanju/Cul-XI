import { describe, expect, it } from "vitest";

import type { PersonRef } from "@/lib/wikipedia/barca-history";
import type { LigaRecords, LigaScorer } from "@/lib/wikipedia/la-liga";

import { ligaLists } from "./liga-lists";

const ref = (name: string): PersonRef => ({ name, title: name });
const ids = new Map<string, number>();
const resolve = (p: PersonRef) => {
  if (!p.title) return null;
  if (!ids.has(p.title)) ids.set(p.title, ids.size + 1);
  return ids.get(p.title)!;
};

const scorer = (i: number, club: string, clubGoals: number, first = 1990): LigaScorer => ({
  person: ref(`Scorer ${i}`),
  goals: 300 - i,
  apps: 400,
  first,
  last: first + 10,
  clubs: [{ club: { name: club, title: club }, goals: clubGoals }],
});

const emptyRecords: LigaRecords = {
  apps: [],
  goals: [],
  seasonGoals: [],
  hatTricks: [],
  coachMatches: [],
  coachWins: [],
  coachTitles: [],
};

const lists = (scorers: LigaScorer[], countryOf: (id: number) => string | null = () => "ES") =>
  ligaLists({ scorers, records: emptyRecords, pichichi: [], zamora: [] }, resolve, countryOf);

describe("ligaLists", () => {
  it("builds a club's top scorers only when the 10th has 100+ for that club", () => {
    const exact = Array.from({ length: 12 }, (_, i) => scorer(i, "Real Madrid CF", 250 - i * 10));
    const keys = lists(exact).map((l) => l.key);
    expect(keys).toContain("liga:club:real-madrid-cf:goals");

    // 10th scored only 60 for the club: someone with 60–99 for them could be missing.
    const unsure = Array.from({ length: 12 }, (_, i) => scorer(i, "Valencia CF", 150 - i * 10));
    expect(lists(unsure).map((l) => l.key)).not.toContain("liga:club:valencia-cf:goals");
  });

  it("splits foreign and Spanish scorers by resolved nationality", () => {
    const scorers = Array.from({ length: 24 }, (_, i) => scorer(i, "Sevilla FC", 50));
    const out = lists(scorers, (id) => (id % 2 ? "AR" : "ES"));
    const foreign = out.find((l) => l.key === "liga:foreign:goals")!;
    expect(foreign.problems).toEqual([]);
    expect(foreign.entries.every((e) => e.playerId % 2 === 1)).toBe(true);
  });

  it("groups scorers by debut era with era hints", () => {
    const scorers = Array.from({ length: 11 }, (_, i) => scorer(i, "Sevilla FC", 50, 2005));
    const era = lists(scorers).find((l) => l.key === "liga:era:2000:goals")!;
    expect(era.entries[0]).toMatchObject({ statLabel: "300 goals", era: "2000s–2010s" });
  });
});
