import { describe, expect, it } from "vitest";

import {
  applyTtt,
  buildGrid,
  categories,
  matches,
  membersFrom,
  NEW_TTT,
  rarityScore,
  rng,
  type Category,
  type GridPlayer,
} from "./grid";

const MADRID = "Q8682";
const AJAX = "Q81888";
const SEVILLA = "Q8723";
const clubLabels = new Map([
  [MADRID, "Real Madrid"],
  [AJAX, "Ajax"],
  [SEVILLA, "Sevilla"],
]);

const players: GridPlayer[] = Array.from({ length: 160 }, (_, i) => ({
  id: i + 1,
  name: `Player ${i + 1}`,
  countryCode: ["ES", "NL", "BR"][i % 3]!,
  nationality: ["Spain", "Netherlands", "Brazil"][i % 3]!,
  position: ["GK", "DEF", "MID", "FWD"][i % 4]!,
  from: 1950 + (i % 8) * 10,
  to: 1955 + (i % 8) * 10,
  pichichis: i % 6 === 0 ? 1 : 0,
  zamoras: 0,
  ligaGoals: i % 6 === 0 ? 120 : 10,
  clubs: new Set([
    ...(i % 7 < 4 ? [MADRID] : []),
    ...(i % 5 < 3 ? [AJAX] : []),
    ...(i % 3 < 2 ? [SEVILLA] : []),
    ...(i % 5 === 0 ? ["Q1"] : []),
  ]),
}));

/** Every candidate category, as the database function would return them. */
const candidates: Category[] = [
  { type: "club", key: MADRID, label: "" },
  { type: "club", key: AJAX, label: "" },
  { type: "club", key: SEVILLA, label: "" },
  { type: "club", key: "Q1", label: "" },
  { type: "nation", key: "ES", label: "" },
  { type: "nation", key: "NL", label: "" },
  { type: "nation", key: "BR", label: "" },
  { type: "position", key: "GK", label: "" },
  { type: "position", key: "FWD", label: "" },
  { type: "decade", key: "1990", label: "" },
  { type: "award", key: "pichichi", label: "" },
];

describe("matches", () => {
  const p = { ...players[0]!, clubs: new Set([AJAX]) }; // ES, GK, 1950–1955, Ajax, Pichichi
  it("checks each category type", () => {
    expect(matches(p, { type: "club", key: AJAX, label: "Ajax" })).toBe(true);
    expect(matches(p, { type: "club", key: MADRID, label: "Real Madrid" })).toBe(false);
    expect(matches(p, { type: "nation", key: "ES", label: "Spain" })).toBe(true);
    expect(matches(p, { type: "position", key: "GK", label: "Goalkeeper" })).toBe(true);
    expect(matches(p, { type: "decade", key: "1950", label: "1950s" })).toBe(true);
    expect(matches(p, { type: "decade", key: "1960", label: "1960s" })).toBe(false);
    expect(matches(p, { type: "award", key: "pichichi", label: "" })).toBe(true);
    expect(matches(p, { type: "award", key: "zamora", label: "" })).toBe(false);
    expect(matches(p, { type: "award", key: "liga100", label: "" })).toBe(true);
  });

  it("counts a current player (no end year) as at Barça now", () => {
    expect(
      matches({ ...p, from: 2019, to: null }, { type: "decade", key: "2020", label: "" }, 2026),
    ).toBe(true);
  });
});

describe("categories", () => {
  const { cats, sets } = categories(membersFrom(players, candidates), clubLabels);

  it("labels clubs with fan names and skips clubs without one", () => {
    const clubs = cats.filter((c) => c.type === "club").map((c) => c.label);
    expect(clubs.sort()).toEqual(["Ajax", "Real Madrid", "Sevilla"]);
  });

  it("leaves Spain out (too many answers) and names nations and trophies", () => {
    const nations = cats.filter((c) => c.type === "nation");
    expect(nations.map((c) => c.key)).toEqual(["NL", "BR"]);
    expect(nations[0]!.label).toBe("Netherlands");
    expect(cats.find((c) => c.type === "award")?.label).toBe("Won the Pichichi");
    expect(sets.get("award:pichichi")).toHaveLength(27);
  });
});

describe("buildGrid", () => {
  const { cats, sets } = categories(membersFrom(players, candidates), clubLabels);

  it("is deterministic per seed and every cell is fair", () => {
    const a = buildGrid(sets, cats, "2026-10-30")!;
    const b = buildGrid(sets, cats, "2026-10-30")!;
    expect(a).toEqual(b);
    expect(a.rows).toHaveLength(3);
    expect(a.cols).toHaveLength(3);
    expect(a.answers).toHaveLength(9);
    expect(a.answers.every((x) => x.count >= 3 && x.examples.length === 3)).toBe(true);
    const all = [...a.rows, ...a.cols];
    expect(new Set(all.map((c) => `${c.type}:${c.key}`)).size).toBe(6);
    expect(all.filter((c) => c.type === "club").length).toBeGreaterThanOrEqual(3);
    expect(all.filter((c) => c.type === "award").length).toBeLessThanOrEqual(1);
  });

  it("picks the best-known answers as examples (members come most famous first)", () => {
    const g = buildGrid(sets, cats, "2026-10-30")!;
    const row = sets.get(`${g.rows[0]!.type}:${g.rows[0]!.key}`)!;
    const col = new Set(sets.get(`${g.cols[0]!.type}:${g.cols[0]!.key}`));
    expect(g.answers[0]!.examples).toEqual(row.filter((id) => col.has(id)).slice(0, 3));
  });

  it("returns null when no fair grid exists", () => {
    const few = categories(membersFrom(players.slice(0, 5), candidates), clubLabels, 1);
    expect(buildGrid(few.sets, few.cats, "x", 50)).toBeNull();
  });

  it("varies by day", () => {
    const r1 = rng("2026-10-30")();
    const r2 = rng("2026-10-31")();
    expect(r1).not.toBe(r2);
  });
});

describe("applyTtt", () => {
  it("fills a cell on a right answer and always spends a guess", () => {
    const { state, outcome } = applyTtt(NEW_TTT, 4, 7, true);
    expect(outcome.kind).toBe("correct");
    expect(state.cells[4]).toBe(7);
    expect(state.guessesLeft).toBe(8);
    const wrong = applyTtt(state, 0, 8, false);
    expect(wrong.outcome.kind).toBe("wrong");
    expect(wrong.state.cells[0]).toBeNull();
    expect(wrong.state.guessesLeft).toBe(7);
  });

  it("rejects filled cells and players already used, without spending a guess", () => {
    const { state } = applyTtt(NEW_TTT, 4, 7, true);
    expect(applyTtt(state, 4, 9, true).outcome.kind).toBe("taken");
    expect(applyTtt(state, 5, 7, true).outcome.kind).toBe("used");
    expect(applyTtt(state, 5, 7, true).state).toBe(state);
  });

  it("ends when the grid is full or guesses run out", () => {
    let s = NEW_TTT;
    for (let i = 0; i < 9; i++) s = applyTtt(s, i, i + 1, true).state;
    expect(s.finished).toBe(true);
    let t = NEW_TTT;
    for (let i = 0; i < 9; i++) t = applyTtt(t, 0, i + 1, false).state;
    expect(t.finished).toBe(true);
    expect(applyTtt(t, 1, 99, true).outcome.kind).toBe("over");
  });
});

describe("rarityScore", () => {
  it("adds pick percentages and 100 per empty cell", () => {
    expect(rarityScore([1, null, 2, null, null, null, null, null, null], [10, null, 5.4])).toBe(
      715,
    );
  });
});
