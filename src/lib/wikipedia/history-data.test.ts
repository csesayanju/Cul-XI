import { describe, expect, it } from "vitest";

import {
  isoDate,
  parseBarcaSeasons,
  parseClasicos,
  parseLigaChampions,
  parseScore,
  roundName,
} from "./history-data";

const tr = (cells: string[], tag = "td") =>
  `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;

const SEASONS = `
<h3 id="La_Liga_era">La Liga era</h3>
<table class="wikitable">
${tr(
  [
    "Season",
    "League",
    "League",
    "League",
    "League",
    "League",
    "League",
    "League",
    "League",
    "League",
    "Copa del Rey",
    "Europe",
    "Europe",
    "Other competitions",
    "Other competitions",
    "Top league scorer(s)",
    "Top league scorer(s)",
  ].map((h) => h),
  "th",
)}
${tr(["2008–09", "La Liga", "38", "27", "6", "5", "105", "35", "87", "1st", "W", "Champions League", "W", "Supercopa de España", "RU", "Eto'o", "30"])}
<tr><td rowspan="2">2009–10</td><td rowspan="2">La Liga</td><td rowspan="2">38</td><td rowspan="2">31</td><td rowspan="2">6</td><td rowspan="2">1</td><td rowspan="2">98</td><td rowspan="2">24</td><td rowspan="2">99</td><td rowspan="2">1st</td><td rowspan="2">R16</td><td rowspan="2">Champions League</td><td rowspan="2">SF</td><td>Supercopa de España</td><td>W</td><td rowspan="2">Messi</td><td rowspan="2">34</td></tr>
<tr><td>FIFA Club World Cup</td><td>W</td></tr>
</table>`;

const CHAMPIONS = `
<h2 id="Champions">Champions</h2>
<table class="wikitable">
${tr(["Season", "Winners", "Pts", "Runners-up", "Pts", "Third place", "Pts", "Top scorer(s)", "Top scorer's club(s)", "Goals"], "th")}
${tr(["1929", "Barcelona (1)", "25", "Madrid FC (1)", "23", "Athletic Bilbao (1)", "20", "Paco Bienzobas", "Real Sociedad", "14"])}
${tr(["2008–09", "Barcelona (19)", "87", "Real Madrid (24)", "78", "Sevilla (1)", "70", "Diego Forlán", "Atlético Madrid", "32"])}
</table>`;

const CLASICOS = `
<h3 id="Primera_División_matches">Primera División matches</h3>
<table class="wikitable">
${tr(["No.", "Date", "Matchweek", "Home team", "Away team", "Score", "Goals (home)", "Goals (away)"], "th")}
${tr(["150", "2 May 2009", "34", "Real Madrid", "Barcelona", "2–6", "Higuaín (14)", "Henry (18, 58)"])}
${tr(["194", "9 May 2027", "35", "Real Madrid", "Barcelona", "", "", ""])}
</table>
<h3 id="Copa_del_Rey_matches">Copa del Rey matches</h3>
<table class="wikitable">
${tr(["Season", "Round", "Round", "Home team", "Away team", "Score", "Goals (home)", "Goals (away)"], "th")}
${tr(["2024–25", "Final", "Final", "Barcelona", "Real Madrid", "3–2 (a.e.t.)", "Pedri (28)", "Mbappé (70)"])}
</table>
<h3 id="Friendlies_and_other_matches">Friendlies</h3>
<table class="wikitable">
${tr(["Date", "Tournament", "Round", "Stadium", "Home team", "Away team", "Score", "Goals (home)", "Goals (away)"], "th")}
${tr(["1 June 1950", "Friendly", "", "", "Barcelona", "Real Madrid", "1–0", "", ""])}
</table>`;

describe("history parsers", () => {
  it("reads Barça seasons, merging extra rows into other competitions", () => {
    const seasons = parseBarcaSeasons(SEASONS);
    expect(seasons).toHaveLength(2);
    expect(seasons[0]).toMatchObject({
      season: "2008–09",
      startYear: 2008,
      won: 27,
      points: 87,
      position: 1,
      copa: "Winners",
      europe: { competition: "Champions League", result: "Winners" },
      others: [{ competition: "Supercopa de España", result: "Runners-up" }],
      topScorers: ["Eto'o"],
      topScorerGoals: 30,
    });
    expect(seasons[1]!.others).toEqual([
      { competition: "Supercopa de España", result: "Winners" },
      { competition: "FIFA Club World Cup", result: "Winners" },
    ]);
  });

  it("reads La Liga podiums and lines the first season up with 1928–29", () => {
    const liga = parseLigaChampions(CHAMPIONS);
    expect(liga.map((s) => s.startYear)).toEqual([1928, 2008]);
    expect(liga[1]).toMatchObject({
      champion: "Barcelona",
      runnerUp: "Real Madrid",
      third: "Sevilla",
      topScorers: ["Diego Forlán"],
      topScorerGoals: 32,
    });
  });

  it("reads competitive Clásicos only, skipping unplayed ones", () => {
    const c = parseClasicos(CLASICOS);
    expect(c.map((x) => x.competition)).toEqual(["La Liga", "Copa del Rey"]);
    expect(c[0]).toMatchObject({
      season: "2008–09",
      startYear: 2008,
      date: "2009-05-02",
      round: "Matchweek 34",
      home: "Real Madrid",
      homeGoals: 2,
      awayGoals: 6,
    });
    expect(c[1]).toMatchObject({ round: "Final", note: "a.e.t.", startYear: 2024 });
  });

  it("parses scores, dates and round codes", () => {
    expect(parseScore("1–1 (4–3 p)")).toEqual({ home: 1, away: 1, note: "4–3 p" });
    expect(parseScore("")).toBeNull();
    expect(isoDate("17 February 1929")).toBe("1929-02-17");
    expect(roundName("QF")).toBe("Quarter-finals");
    expect(roundName("–")).toBeNull();
  });
});
