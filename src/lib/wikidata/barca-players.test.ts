import { describe, expect, it } from "vitest";

import { parseBarcaPlayers, shortPosition } from "./barca-players";

const v = (value: string) => ({ value });
const P = (id: string) => v(`http://www.wikidata.org/entity/${id}`);

describe("parseBarcaPlayers", () => {
  it("merges stints, prefers sport nationality and collects aliases", () => {
    const players = parseBarcaPlayers([
      {
        player: P("Q1"),
        playerLabel: v("Àlex Serra"),
        st: v("s1"),
        start: v("2018-07-01T00:00:00Z"),
        end: v("2020-06-30T00:00:00Z"),
        apps: v("40"),
        goals: v("3"),
        citizenCode: v("es"),
        citizenCountry: v("Spain"),
        sportCode: v("ad"),
        sportCountry: v("Andorra"),
        position: v("centre-back"),
        born: v("2000-02-01T00:00:00Z"),
        aliases: v("Àlex|Alex Serra"),
      },
      {
        player: P("Q1"),
        playerLabel: v("Àlex Serra"),
        st: v("s2"),
        start: v("2022-07-01T00:00:00Z"),
        apps: v("10"),
        goals: v("1"),
        aliases: v("Alex Serra"),
      },
      // Same stint repeated (another alias row) must not double-count.
      { player: P("Q1"), playerLabel: v("Àlex Serra"), st: v("s2"), apps: v("10"), goals: v("1") },
    ]);
    expect(players).toEqual([
      {
        wikidataId: "Q1",
        name: "Àlex Serra",
        aliases: ["Àlex", "Alex Serra"],
        nationality: "Andorra",
        countryCode: "AD",
        position: "DEF",
        birthYear: 2000,
        barcaFrom: 2018,
        barcaTo: 2020,
        apps: 50,
        goals: 4,
      },
    ]);
  });

  it("skips entities without an English label", () => {
    expect(parseBarcaPlayers([{ player: P("Q9"), playerLabel: v("Q9"), st: v("s") }])).toEqual([]);
  });
});

describe("shortPosition", () => {
  it.each([
    ["goalkeeper", "GK"],
    ["full-back", "DEF"],
    ["defensive midfielder", "MID"],
    ["winger", "FWD"],
    ["centre-forward", "FWD"],
    ["manager", null],
  ])("%s -> %s", (label, pos) => expect(shortPosition(label)).toBe(pos));
});
