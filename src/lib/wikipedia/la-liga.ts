import {
  cell,
  num,
  peopleIn,
  personIn,
  tablesOf,
  text,
  yearRange,
  type PersonRef,
  type Table,
} from "./barca-history";

/**
 * One-time import of La Liga history from Wikipedia's list articles (free, no key): every club
 * that has played in La Liga, the all-time records tables, 100+ goal scorers, and the Pichichi
 * and Zamora winners. Pure parsers over article HTML; fetching reuses barca-history.ts.
 */

export const LIGA_PAGES = {
  clubs: "List of La Liga clubs",
  scorers: "List of La Liga top scorers",
  records: "La Liga records and statistics",
  pichichi: "Pichichi Trophy",
  zamora: "Ricardo Zamora Trophy",
} as const;

export interface LigaClub {
  rank: number;
  club: PersonRef;
}

export interface LigaScorer {
  person: PersonRef;
  goals: number;
  apps: number | null;
  first: number | null;
  last: number | null;
  /** Clubs he scored for (per-club goals when the table lists several). */
  clubs: { club: PersonRef; goals: number | null }[];
}

export interface LigaRow {
  person: PersonRef;
  value: number;
  /** Years active / season / years, as written. */
  years: string | null;
  /** e.g. the club of a single-season record. */
  note: string | null;
}

export interface LigaRecords {
  apps: LigaRow[];
  goals: LigaRow[];
  seasonGoals: LigaRow[];
  hatTricks: LigaRow[];
  coachMatches: LigaRow[];
  coachWins: LigaRow[];
  coachTitles: LigaRow[];
}

export interface AwardWinner {
  season: string;
  startYear: number;
  winners: PersonRef[];
  club: string | null;
  goals: number | null;
}

/** "List of La Liga clubs" — the all-time table (every club that has played in La Liga). */
export function parseLigaClubs(html: string): LigaClub[] {
  const table = tablesOf(html).find(
    (t) => t.headers.includes("Club") && t.headers.some((h) => /^Pts$/.test(h)),
  );
  if (!table) return [];
  return table.rows.flatMap((row) => {
    const club = personIn(cell(table, row, /^Club$/));
    const rank = num(text(cell(table, row, /^Pos/)));
    return club && rank != null ? [{ rank, club }] : [];
  });
}

/** "List of La Liga top scorers" — every player with 100+ La Liga goals. */
export function parseLigaScorers(html: string): LigaScorer[] {
  const table = tablesOf(html).find(
    (t) => t.headers.some((h) => /^First$/.test(h)) && t.headers.some((h) => /^Goals$/.test(h)),
  );
  if (!table) return [];
  return table.rows.flatMap((row) => {
    const person = personIn(cell(table, row, /^Player/));
    const goals = num(text(cell(table, row, /^Goals$/)));
    if (!person || goals == null) return [];
    const clubCell = cell(table, row, /Club/);
    const clubText = text(clubCell);
    const perClub = [...clubText.matchAll(/\((\d+)\s*\/\s*\d+\)/g)].map((m) => Number(m[1]));
    const clubs = peopleIn(clubCell).map((club, i) => ({
      club,
      goals: perClub.length ? (perClub[i] ?? null) : goals,
    }));
    return [
      {
        person,
        goals,
        apps: num(text(cell(table, row, /^Apps$/))),
        first: num(text(cell(table, row, /^First$/))),
        last: num(text(cell(table, row, /^Last$/))),
        clubs,
      },
    ];
  });
}

function rows(table: Table | undefined, who: RegExp, value: RegExp, years?: RegExp, note?: RegExp) {
  if (!table) return [];
  return table.rows.flatMap((row): LigaRow[] => {
    const person = personIn(cell(table, row, who));
    const v = num(text(cell(table, row, value)));
    if (!person || v == null) return [];
    return [
      {
        person,
        value: v,
        years: years ? text(cell(table, row, years)) || null : null,
        note: note ? text(cell(table, row, note)) || null : null,
      },
    ];
  });
}

/** "La Liga records and statistics" — player and coach records tables. */
export function parseLigaRecords(html: string): LigaRecords {
  const tables = tablesOf(html);
  const at = (heading: RegExp) => tables.find((t) => heading.test(t.heading ?? ""));
  return {
    apps: rows(at(/^Most_appearances/), /^Player/, /^Apps$/, /Years/),
    goals: rows(at(/^Top_goalscorers/), /^Player/, /^Goals$/, /Years/),
    seasonGoals: rows(
      at(/^Most_goals_in_a_La_Liga_season_\(at_least_35/),
      /^Player/,
      /^Goals$/,
      /^Season/,
      /^Club/,
    ),
    hatTricks: rows(at(/^Most_hat-tricks/), /^Player/, /^Hat-tricks/),
    coachMatches: rows(at(/^Most_matches_managed/), /^Coach/, /^Matches$/, /^Years/),
    coachWins: rows(at(/^Most_matches_won/), /^Coach/, /^Wins$/, /^Years/),
    coachTitles: rows(at(/^Most_titles_won/), /^Coach/, /^Titles$/, /^Seasons/),
  };
}

/** Season-by-season winners of a trophy (first table whose heading matches). */
export function parseAwardWinners(html: string, heading: RegExp): AwardWinner[] {
  const table = tablesOf(html).find(
    (t) => heading.test(t.heading ?? "") && t.headers.some((h) => /^Season/.test(h)),
  );
  if (!table) return [];
  const seen = new Set<string>();
  return table.rows.flatMap((row) => {
    const season = text(cell(table, row, /^Season/));
    const startYear = yearRange(season).from;
    if (startYear == null || seen.has(season)) return [];
    seen.add(season);
    const winners = peopleIn(cell(table, row, /^Player/)).filter(
      (p) => !/^\d+$/.test(p.name) && p.title !== null,
    );
    return winners.length
      ? [
          {
            season,
            startYear,
            winners,
            club: text(cell(table, row, /^Club/)) || null,
            goals: num(text(cell(table, row, /^Goals/))),
          },
        ]
      : [];
  });
}

/** How many times each person won (keyed by Wikipedia title). */
export function countWins(
  winners: AwardWinner[],
): Map<string, { person: PersonRef; wins: number }> {
  const out = new Map<string, { person: PersonRef; wins: number }>();
  for (const w of winners) {
    for (const p of w.winners) {
      const k = p.title ?? p.name;
      const cur = out.get(k) ?? { person: p, wins: 0 };
      cur.wins++;
      out.set(k, cur);
    }
  }
  return out;
}
