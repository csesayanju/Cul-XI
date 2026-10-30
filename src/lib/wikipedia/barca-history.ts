import { parse, type HTMLElement } from "node-html-parser";

/**
 * One-time import of Barça history from Wikipedia's curated list articles (free, no key):
 * players with 100+ appearances, club records, managers, presidents and every season's top
 * league scorer. Pure parsing functions take the article HTML; fetch helpers are at the end.
 * Facts only are stored; the app credits Wikipedia (CC BY-SA) as the source.
 */

export const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
export const USER_AGENT = "CuleXI/1.0 (private fantasy app; https://github.com/csesayanju/Cul-XI)";

export const HISTORY_PAGES = {
  players: "List of FC Barcelona players",
  records: "List of FC Barcelona records and statistics",
  managers: "List of FC Barcelona managers",
  presidents: "List of FC Barcelona presidents",
  seasons: "List of FC Barcelona seasons",
} as const;

export interface PersonRef {
  name: string;
  /** Wikipedia article title the name links to (used to find the Wikidata id). */
  title: string | null;
}

export interface HistoryPlayer {
  person: PersonRef;
  nationality: string | null;
  position: string | null;
  from: number | null;
  to: number | null;
  captain: boolean;
  leagueApps: number | null;
  leagueGoals: number | null;
}

export interface RecordRow {
  person: PersonRef;
  nationality: string | null;
  years: string | null;
  value: number;
  /** e.g. the year of a transfer. */
  note: string | null;
}

export interface Records {
  appsAll: RecordRow[];
  goalsAll: RecordRow[];
  goalsEurope: RecordRow[];
  goalsLiga: RecordRow[];
  goalsCopa: RecordRow[];
  signings: RecordRow[];
  sales: RecordRow[];
}

export interface SeasonScorer {
  season: string;
  startYear: number;
  scorers: PersonRef[];
  goals: number | null;
}

export interface StaffRow {
  person: PersonRef;
  nationality: string | null;
  /** Year + month (1–12, or null if only the year is known). */
  from: { year: number; month: number | null } | null;
  to: { year: number; month: number | null } | null;
  honours: number | null;
}

// ---------------------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------------------

export const text = (el: HTMLElement | undefined) =>
  (el?.text ?? "")
    .replace(/\[[^\]]*\]/g, "") // footnote markers like [12]
    .replace(/[*†‡§¶#^]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const num = (s: string | null | undefined): number | null => {
  const m = (s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** The person a cell names: its first article link (not files/flags), else its text. */
export function personIn(cell: HTMLElement | undefined): PersonRef | null {
  if (!cell) return null;
  const link = cell.querySelectorAll("a").find((a) => {
    const href = a.getAttribute("href") ?? "";
    return (
      href.startsWith("/wiki/") &&
      !/^\/wiki\/(File|Image|Help|Template|Wikipedia):/.test(href) &&
      a.text.trim()
    );
  });
  if (link) {
    const title =
      (link.getAttribute("title") ?? "").replace(/ \(page does not exist\)$/, "") || null;
    return { name: text(link), title };
  }
  const name = text(cell);
  return name && name !== "—" ? { name, title: null } : null;
}

/** All article links in a cell (for cells listing several people). */
export function peopleIn(cell: HTMLElement | undefined): PersonRef[] {
  if (!cell) return [];
  return cell
    .querySelectorAll("a")
    .filter(
      (a) =>
        (a.getAttribute("href") ?? "").startsWith("/wiki/") &&
        a.text.trim() &&
        !a.querySelector("img"),
    )
    .filter(
      (a) => !/^\/wiki\/(File|Image|Help|Template|Wikipedia):/.test(a.getAttribute("href") ?? ""),
    )
    .map((a) => ({
      name: text(a),
      title: (a.getAttribute("title") ?? "").replace(/ \(page does not exist\)$/, "") || null,
    }));
}

export interface Table {
  /** id of the closest heading before the table, e.g. "La_Liga". */
  heading: string | null;
  headers: string[];
  rows: HTMLElement[][];
}

const span = (el: HTMLElement, attr: string) =>
  Math.max(1, Number.parseInt(el.getAttribute(attr) ?? "1", 10) || 1);

/** Lays rows out on a grid, repeating cells that span several rows or columns. */
function grid(trs: HTMLElement[]): HTMLElement[][] {
  const carry: ({ el: HTMLElement; left: number } | undefined)[] = [];
  return trs.map((tr) => {
    const row: HTMLElement[] = [];
    let col = 0;
    const fillCarried = () => {
      while (carry[col] && carry[col]!.left > 0) {
        row[col] = carry[col]!.el;
        carry[col]!.left--;
        col++;
      }
    };
    for (const el of tr.querySelectorAll("th, td")) {
      fillCarried();
      const rows = span(el, "rowspan");
      for (let k = 0; k < span(el, "colspan"); k++) {
        row[col] = el;
        carry[col] = rows > 1 ? { el, left: rows - 1 } : undefined;
        col++;
      }
    }
    fillCarried();
    return row;
  });
}

/** Every `wikitable` in the article with its nearest preceding heading. */
export function tablesOf(html: string): Table[] {
  const out: Table[] = [];
  const re = /<table class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const before = html.slice(0, m.index);
    const headings = [...before.matchAll(/<h[2-5][^>]*id="([^"]+)"/g)];
    const trs = parse(m[0]).querySelectorAll("tr");
    const laid = grid(trs);
    const headerIndex = trs.findIndex((tr) => tr.querySelectorAll("th").length > 1);
    const headers = (laid[headerIndex] ?? []).map((th) => text(th));
    const rows = laid.filter(
      (_, i) => i !== headerIndex && trs[i]!.querySelectorAll("td").length > 0,
    );
    out.push({ heading: headings.at(-1)?.[1] ?? null, headers, rows });
  }
  return out;
}

/** Cell under the first header matching `header`. */
export function cell(table: Table, row: HTMLElement[], header: RegExp): HTMLElement | undefined {
  const index = table.headers.findIndex((h) => header.test(h));
  return index < 0 ? undefined : row[index];
}

/** "1899–1903" / "1910–1915, 1918–1920" / "2019–" -> { from, to } (to null = still there). */
export function yearRange(s: string): { from: number | null; to: number | null } {
  const years = [...s.matchAll(/\d{4}/g)].map((m) => Number(m[0]));
  if (years.length === 0) return { from: null, to: null };
  const open = /[–-]\s*(present)?\s*$/.test(s.trim());
  return { from: Math.min(...years), to: open ? null : Math.max(...years) };
}

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

/** "1 July 2008" / "January 2020" / "1899" / "present" -> { year, month } (null if none). */
export function parseDate(s: string): { year: number; month: number | null } | null {
  const year = num(s.match(/\d{4}/)?.[0]);
  if (year == null) return null;
  const lower = s.toLowerCase();
  const month = MONTHS.findIndex((m) => lower.includes(m));
  return { year, month: month >= 0 ? month + 1 : null };
}

// ---------------------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------------------

/** "List of FC Barcelona players" — everyone with 100+ appearances. */
export function parsePlayers(html: string): HistoryPlayer[] {
  const table = tablesOf(html).find((t) => t.headers.some((h) => /League appearances/i.test(h)));
  if (!table) return [];
  return table.rows.flatMap((row) => {
    const person = personIn(cell(table, row, /^Name/i));
    if (!person) return [];
    const career = yearRange(text(cell(table, row, /career/i)));
    const captaincy = text(cell(table, row, /Captaincy/i));
    return [
      {
        person,
        nationality: text(cell(table, row, /Nationality/i)) || null,
        position: text(cell(table, row, /Position/i)) || null,
        from: career.from,
        to: career.to,
        captain: !!captaincy && captaincy !== "—",
        leagueApps: num(text(cell(table, row, /League appearances/i))),
        leagueGoals: num(text(cell(table, row, /League goals/i))),
      },
    ];
  });
}

function recordRows(table: Table | undefined, value: RegExp, note?: RegExp): RecordRow[] {
  if (!table) return [];
  return table.rows.flatMap((row) => {
    const person = personIn(cell(table, row, /^Player/i));
    const v = num(text(cell(table, row, value)));
    if (!person || v == null) return [];
    return [
      {
        person,
        nationality: text(cell(table, row, /Nationality/i)) || null,
        years: text(cell(table, row, /^Years/i)) || null,
        value: v,
        note: note ? text(cell(table, row, note)) || null : null,
      },
    ];
  });
}

/** "List of FC Barcelona records and statistics" — top-10 record tables. */
export function parseRecords(html: string): Records {
  const tables = tablesOf(html);
  const byHeading = (re: RegExp, pred: (t: Table) => boolean = () => true) =>
    tables.find((t) => re.test(t.heading ?? "") && pred(t));
  const has = (re: RegExp) => (t: Table) => t.headers.some((h) => re.test(h));

  return {
    appsAll: recordRows(tables.find(has(/^Europe$/)), /^Total/i),
    goalsAll: recordRows(tables.find(has(/Official goals/i)), /Official goals/i),
    goalsEurope: recordRows(tables.find(has(/^CL$/)), /^Total/i),
    goalsLiga: recordRows(byHeading(/^La_Liga/, has(/^Goals$/)), /^Goals$/),
    goalsCopa: recordRows(byHeading(/^Copa_del_Rey/, has(/^Goals$/)), /^Goals$/),
    signings: recordRows(tables.find(has(/^From$/)), /€/, /^Year/i),
    sales: recordRows(tables.find(has(/^To$/)), /€/, /^Date/i),
  };
}

/** "List of FC Barcelona seasons" — each season's top league scorer(s). */
export function parseSeasons(html: string): SeasonScorer[] {
  const table = tablesOf(html).find((t) => t.headers.some((h) => /Top league scorer/i.test(h)));
  if (!table) return [];
  const seen = new Set<string>();
  return table.rows.flatMap((row) => {
    const season = text(row[0]);
    // Cells spanning several rows are repeated on each: keep one row per season.
    if (seen.has(season)) return [];
    seen.add(season);
    const start = num(season.match(/^\d{4}/)?.[0]);
    if (start == null || row.length < 3) return [];
    const scorers = peopleIn(row[row.length - 2]);
    const goals = num(text(row[row.length - 1]));
    return scorers.length ? [{ season, startYear: start, scorers, goals }] : [];
  });
}

/** Managers or presidents: Name, (Nationality), From, To, honours. */
export function parseStaff(html: string): StaffRow[] {
  const table = tablesOf(html).find(
    (t) => t.headers.some((h) => /^From/i.test(h)) && t.headers.some((h) => /^To/i.test(h)),
  );
  if (!table) return [];
  return table.rows.flatMap((row) => {
    const person = personIn(cell(table, row, /^Name/i));
    if (!person) return [];
    return [
      {
        person,
        nationality: text(cell(table, row, /Nationality/i)) || null,
        from: parseDate(text(cell(table, row, /^From/i))),
        to: parseDate(text(cell(table, row, /^To/i))),
        honours: num(text(cell(table, row, /No\. of honours|total number/i))),
      },
    ];
  });
}

// ---------------------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------------------

async function get<T>(params: Record<string, string>, fetchImpl: typeof fetch): Promise<T> {
  const url = `${WIKIPEDIA_API}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  const res = await fetchImpl(url, { headers: { "user-agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const articleUrl = (title: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

export async function fetchArticleHtml(title: string, fetchImpl: typeof fetch = globalThis.fetch) {
  const json = await get<{ parse?: { title: string; text: string }; error?: { info: string } }>(
    { action: "parse", prop: "text", redirects: "1", page: title },
    fetchImpl,
  );
  if (!json.parse) throw new Error(`Wikipedia: ${json.error?.info ?? "no content"} (${title})`);
  return json.parse.text;
}

/** Article titles -> Wikidata ids (50 titles per request; follows redirects). */
export async function wikidataIdsFor(
  titles: string[],
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(titles.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const json = await get<{
      query?: {
        normalized?: { from: string; to: string }[];
        redirects?: { from: string; to: string }[];
        pages?: { title: string; pageprops?: { wikibase_item?: string } }[];
      };
    }>(
      {
        action: "query",
        prop: "pageprops",
        ppprop: "wikibase_item",
        redirects: "1",
        titles: batch.join("|"),
      },
      fetchImpl,
    );
    const q = json.query ?? {};
    const byTitle = new Map((q.pages ?? []).map((p) => [p.title, p.pageprops?.wikibase_item]));
    const resolve = (t: string) => {
      let cur = t;
      for (const n of q.normalized ?? []) if (n.from === cur) cur = n.to;
      for (const r of q.redirects ?? []) if (r.from === cur) cur = r.to;
      return byTitle.get(cur);
    };
    for (const t of batch) {
      const id = resolve(t);
      if (id) out.set(t, id);
    }
  }
  return out;
}
