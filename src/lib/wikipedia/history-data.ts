import { num, tablesOf, text, type Table } from "./barca-history";

/**
 * Season-by-season Barça and La Liga history from Wikipedia's list articles (free, no key):
 * every Barça season since 1929, every La Liga podium and Pichichi, and every competitive
 * El Clásico. Pure parsers take the article HTML; facts only are stored (CC BY-SA, credited).
 */

export const DATA_PAGES = {
  barcaSeasons: "List of FC Barcelona seasons",
  ligaChampions: "List of Spanish football champions",
  clasicos: "List of El Clásico matches",
} as const;

export interface BarcaSeason {
  season: string;
  startYear: number;
  division: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
  /** Copa del Rey round reached, e.g. "Winners", "Semi-finals" (null: didn't take part). */
  copa: string | null;
  europe: { competition: string; result: string } | null;
  /** Other trophies played that season (Supercopa, Club World Cup…). */
  others: { competition: string; result: string }[];
  topScorers: string[];
  topScorerGoals: number | null;
}

export interface LigaSeason {
  season: string;
  startYear: number;
  champion: string;
  championPoints: number | null;
  runnerUp: string;
  runnerUpPoints: number | null;
  third: string | null;
  thirdPoints: number | null;
  topScorers: string[];
  topScorerClubs: string[];
  topScorerGoals: number | null;
}

export interface Clasico {
  /** Stable key: competition + date or season + round + leg + home team. */
  key: string;
  competition: string;
  season: string;
  startYear: number;
  date: string | null;
  round: string | null;
  home: "Barcelona" | "Real Madrid";
  homeGoals: number;
  awayGoals: number;
  /** "a.e.t.", "4–3 p" etc. */
  note: string | null;
  homeScorers: string | null;
  awayScorers: string | null;
}

/** Results as Wikipedia abbreviates them in season tables. */
const ROUNDS: Record<string, string> = {
  W: "Winners",
  C: "Winners",
  RU: "Runners-up",
  F: "Runners-up",
  SF: "Semi-finals",
  QF: "Quarter-finals",
  R16: "Round of 16",
  R32: "Round of 32",
  R64: "Round of 64",
  R128: "Round of 128",
  GS: "Group stage",
  LP: "League phase",
  KPO: "Knockout play-offs",
  PO: "Play-off round",
  "1R": "First round",
  "2R": "Second round",
  "3R": "Third round",
  "4R": "Fourth round",
  "2GS": "Second group stage",
  GS1: "Group stage",
  GS2: "Second group stage",
};

export const roundName = (raw: string): string | null => {
  const s = raw.trim();
  if (!s || /^[–—-]$/.test(s) || /^n\/?a$/i.test(s) || /did not/i.test(s)) return null;
  return ROUNDS[s.toUpperCase()] ?? s;
};

const ordinal = (s: string) => num(s.match(/^\d+/)?.[0]);
const clubName = (s: string) =>
  s
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\[.*?\]/g, "")
    .trim();
const names = (s: string) =>
  s
    .split(/\s*(?:,|\/|&| and |\n)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);

/** "1928–29" / "1929" -> 1928 / 1929; null if it isn't a season. */
export const seasonStart = (s: string) => num(s.match(/^(\d{4})/)?.[1]);

const at = (row: Table["rows"][number], i: number) => text(row[i]);

/** "List of FC Barcelona seasons" — the La Liga era table. */
export function parseBarcaSeasons(html: string): BarcaSeason[] {
  const table = tablesOf(html).find(
    (t) => t.headers.some((h) => /Top league scorer/i.test(h)) && t.headers.includes("League"),
  );
  if (!table) return [];
  const h = table.headers;
  const league = h.indexOf("League");
  const copa = h.findIndex((x) => /Copa del Rey/i.test(x));
  const europe = h.indexOf("Europe");
  const other = h.findIndex((x) => /Other/i.test(x));
  const scorer = h.findIndex((x) => /Top league scorer/i.test(x));
  if ([league, copa, europe, scorer].some((i) => i < 0)) return [];

  const bySeason = new Map<string, BarcaSeason>();
  for (const row of table.rows) {
    const season = at(row, 0);
    const startYear = seasonStart(season);
    if (startYear == null) continue;
    const existing = bySeason.get(season);
    const otherComp = other >= 0 ? at(row, other) : "";
    const otherResult = other >= 0 ? roundName(at(row, other + 1)) : null;
    if (existing) {
      // Extra rows for one season list further "other" competitions.
      if (otherComp && otherResult && !existing.others.some((o) => o.competition === otherComp)) {
        existing.others.push({ competition: otherComp, result: otherResult });
      }
      continue;
    }
    const n = (i: number) => num(at(row, league + i));
    const [played, won, drawn, lost, gf, ga, pts] = [1, 2, 3, 4, 5, 6, 7].map(n);
    const position = ordinal(at(row, league + 8));
    if ([played, won, drawn, lost, gf, ga, pts, position].some((v) => v == null)) continue;
    const europeComp = at(row, europe);
    const europeResult = roundName(at(row, europe + 1));
    bySeason.set(season, {
      season,
      startYear,
      division: at(row, league),
      played: played!,
      won: won!,
      drawn: drawn!,
      lost: lost!,
      goalsFor: gf!,
      goalsAgainst: ga!,
      points: pts!,
      position: position!,
      copa: roundName(at(row, copa)),
      europe: europeComp && europeResult ? { competition: europeComp, result: europeResult } : null,
      others: otherComp && otherResult ? [{ competition: otherComp, result: otherResult }] : [],
      topScorers: names(at(row, scorer)),
      topScorerGoals: num(at(row, scorer + 1)),
    });
  }
  return [...bySeason.values()].sort((a, b) => a.startYear - b.startYear);
}

/** "List of Spanish football champions" — winners, runners-up, third and Pichichi per season. */
export function parseLigaChampions(html: string): LigaSeason[] {
  const table = tablesOf(html).find(
    (t) => t.headers.includes("Winners") && t.headers.includes("Runners-up"),
  );
  if (!table) return [];
  const h = table.headers;
  const iWin = h.indexOf("Winners");
  const iRun = h.indexOf("Runners-up");
  const iThird = h.findIndex((x) => /Third/i.test(x));
  const iScorer = h.findIndex((x) => /^Top scorer\(s\)$/i.test(x));
  const iClub = h.findIndex((x) => /scorer's club/i.test(x));
  const iGoals = h.indexOf("Goals");
  return table.rows.flatMap((row) => {
    const season = at(row, 0);
    const startYear = seasonStart(season);
    const champion = clubName(at(row, iWin));
    if (startYear == null || !champion) return [];
    return [
      {
        season,
        // The first league ("1929", played in 1929) is Barça's "1928–29": align on the
        // season that ends that year, like every "1977–78" row.
        startYear: /^\d{4}$/.test(season) ? startYear - 1 : startYear,
        champion,
        championPoints: num(at(row, iWin + 1)),
        runnerUp: clubName(at(row, iRun)),
        runnerUpPoints: num(at(row, iRun + 1)),
        third: iThird >= 0 ? clubName(at(row, iThird)) || null : null,
        thirdPoints: iThird >= 0 ? num(at(row, iThird + 1)) : null,
        topScorers: iScorer >= 0 ? names(at(row, iScorer)) : [],
        topScorerClubs: iClub >= 0 ? names(at(row, iClub)) : [],
        topScorerGoals: iGoals >= 0 ? num(at(row, iGoals)) : null,
      },
    ];
  });
}

/** Competitive senior competitions on the Clásico list (friendlies and reserves left out). */
const CLASICO_COMPETITIONS: Record<string, string> = {
  Primera_División_matches: "La Liga",
  Copa_del_Rey_matches: "Copa del Rey",
  Copa_de_la_Liga_matches: "Copa de la Liga",
  Supercopa_de_España_matches: "Supercopa de España",
  Copa_de_la_Coronación: "Copa de la Coronación",
  UEFA_Champions_League_matches: "Champions League",
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** "17 February 1929" -> "1929-02-17". */
export function isoDate(s: string): string | null {
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}

/** A league season from a match date: August onwards belongs to the season starting then. */
const seasonOfDate = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 8 ? y : y - 1;
  return { season: `${start}–${String((start + 1) % 100).padStart(2, "0")}`, startYear: start };
};

/** "3–2 (a.e.t.)" -> { home: 3, away: 2, note: "a.e.t." }; null if unplayed. */
export function parseScore(s: string): { home: number; away: number; note: string | null } | null {
  const m = s.match(/(\d+)\s*[–—-]\s*(\d+)/);
  if (!m) return null;
  const note =
    s
      .slice((m.index ?? 0) + m[0].length)
      .replace(/[()]/g, " ")
      .trim() || null;
  return { home: Number(m[1]), away: Number(m[2]), note };
}

const team = (s: string): Clasico["home"] | null =>
  /barcelona/i.test(s) ? "Barcelona" : /madrid/i.test(s) ? "Real Madrid" : null;

/** "List of El Clásico matches" — every competitive meeting with its scorers. */
export function parseClasicos(html: string): Clasico[] {
  const out: Clasico[] = [];
  for (const table of tablesOf(html)) {
    const competition = table.heading ? CLASICO_COMPETITIONS[table.heading] : undefined;
    if (!competition) continue;
    const h = table.headers;
    const iDate = h.indexOf("Date");
    const iSeason = h.indexOf("Season");
    const iRound = h.findIndex((x) => /^Round|^Matchweek/.test(x));
    const iLeg = h[iRound + 1] === h[iRound] ? iRound + 1 : -1;
    const iHome = h.indexOf("Home team");
    const iAway = h.indexOf("Away team");
    const iScore = h.indexOf("Score");
    const iGh = h.indexOf("Goals (home)");
    const iGa = h.indexOf("Goals (away)");
    for (const row of table.rows) {
      const score = parseScore(at(row, iScore));
      const home = team(at(row, iHome));
      const away = team(at(row, iAway));
      if (!score || !home || !away || home === away) continue;
      const date = iDate >= 0 ? isoDate(at(row, iDate)) : null;
      const fromSeason = iSeason >= 0 ? at(row, iSeason) : "";
      const s = date
        ? seasonOfDate(date)
        : seasonStart(fromSeason) != null
          ? { season: fromSeason, startYear: seasonStart(fromSeason)! }
          : null;
      if (!s) continue;
      const round = [iRound >= 0 ? at(row, iRound) : "", iLeg >= 0 ? at(row, iLeg) : ""]
        .filter((x, i, all) => x && all.indexOf(x) === i)
        .join(" · ");
      out.push({
        key: [competition, date ?? s.season, round, home].join("|"),
        competition,
        season: s.season,
        startYear: s.startYear,
        date,
        round: competition === "La Liga" ? (round ? `Matchweek ${round}` : null) : round || null,
        home,
        homeGoals: score.home,
        awayGoals: score.away,
        note: score.note,
        homeScorers: iGh >= 0 ? at(row, iGh) || null : null,
        awayScorers: iGa >= 0 ? at(row, iGa) || null : null,
      });
    }
  }
  // Same key twice (rare formatting quirks): keep the first.
  return [...new Map(out.map((c) => [c.key, c])).values()];
}
