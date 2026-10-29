import { describe, expect, it } from "vitest";

import { parseDate, parseRecords, parseStaff, yearRange } from "./barca-history";

const link = (name: string) =>
  `<a href="/wiki/${name.replace(/ /g, "_")}" title="${name}">${name}</a>`;

describe("barca-history parsing", () => {
  it("reads years and dates", () => {
    expect(yearRange("1910–1915, 1918–1920")).toEqual({ from: 1910, to: 1920 });
    expect(yearRange("2019–")).toEqual({ from: 2019, to: null });
    expect(parseDate("1 July 2008")).toEqual({ year: 2008, month: 7 });
    expect(parseDate("1899")).toEqual({ year: 1899, month: null });
    expect(parseDate("Present")).toBeNull();
  });

  it("lines up rows whose cells span several rows (tied ranks)", () => {
    const html = `<h3 id="Goals">Goals</h3><table class="wikitable">
      <tr><th>Rank</th><th>Player</th><th>Nationality</th><th>Years</th><th>Official goals</th></tr>
      <tr><td>1</td><td>${link("Lionel Messi")}[1]</td><td>Argentina</td><td>2004–2021</td><td>672</td></tr>
      <tr><td rowspan="2">2</td><td>${link("Rivaldo")}</td><td>Brazil</td><td>1997–2002</td><td>130</td></tr>
      <tr><td>${link("Samuel Eto'o")}</td><td>Cameroon</td><td>2004–2009</td><td>130</td></tr>
    </table>`;
    const goals = parseRecords(html).goalsAll;
    expect(goals.map((g) => [g.person.title, g.value, g.nationality])).toEqual([
      ["Lionel Messi", 672, "Argentina"],
      ["Rivaldo", 130, "Brazil"],
      ["Samuel Eto'o", 130, "Cameroon"],
    ]);
  });

  it("parses managers with several spells", () => {
    const html = `<table class="wikitable">
      <tr><th>Name</th><th>From</th><th>To</th><th>Honours</th><th>No. of honours</th></tr>
      <tr><td>${link("Johan Cruyff")}</td><td>4 May 1988</td><td>18 May 1996</td><td>Liga</td><td>11</td></tr>
      <tr><td>${link("Hansi Flick")}</td><td>1 July 2024</td><td>Present</td><td>Liga</td><td>5</td></tr>
    </table>`;
    expect(parseStaff(html)).toEqual([
      {
        person: { name: "Johan Cruyff", title: "Johan Cruyff" },
        nationality: null,
        from: { year: 1988, month: 5 },
        to: { year: 1996, month: 5 },
        honours: 11,
      },
      {
        person: { name: "Hansi Flick", title: "Hansi Flick" },
        nationality: null,
        from: { year: 2024, month: 7 },
        to: null,
        honours: 5,
      },
    ]);
  });
});
