import type {
  HistoryPlayer,
  PersonRef,
  Records,
  RecordRow,
  SeasonScorer,
  StaffRow,
} from "@/lib/wikipedia/barca-history";

import { LIST_SIZE } from "./game";
import { formatEuros } from "./lists";

/**
 * Builds Culé Ten lists spanning Barça's whole history from facts parsed from Wikipedia
 * (pure). Each list is checked before it can go live; a list with problems is saved as a draft
 * for an admin instead.
 */

export interface HistorySources {
  players: HistoryPlayer[];
  records: Records;
  seasons: SeasonScorer[];
  managers: StaffRow[];
  presidents: StaffRow[];
}

export interface HistoryEntry {
  playerId: number;
  statLabel: string;
  /** Shown as a hint next to the nationality, e.g. "1990s–2000s". */
  era: string | null;
}

export interface HistoryList {
  /** Stable key, e.g. "wp:goals". */
  key: string;
  title: string;
  subtitle: string;
  entries: HistoryEntry[];
  /** Why the list can't go live automatically; empty = passed every check. */
  problems: string[];
}

/** Repository id for a person, or null if they couldn't be matched. */
export type Resolve = (person: PersonRef) => number | null;

interface Row {
  person: PersonRef;
  value: number;
  label: string;
  era: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

/** 1994, 2006 -> "1990s–2000s"; same decade -> "1990s". */
export function eraOf(from: number | null, to: number | null): string | null {
  if (from == null) return null;
  const a = Math.floor(from / 10) * 10;
  const b = Math.floor((to ?? from) / 10) * 10;
  return a === b ? `${a}s` : `${a}s–${b}s`;
}

const eraOfYears = (years: string | null, now: number) => {
  const ys = [...(years ?? "").matchAll(/\d{4}/g)].map((m) => Number(m[0]));
  if (ys.length === 0) return null;
  const open = /[–-]\s*(present)?\s*$/.test((years ?? "").trim());
  return eraOf(Math.min(...ys), open ? now : Math.max(...ys));
};

/**
 * Checks and resolves a ranked list. `complete` = the rows are the whole field (so a tie
 * between 10th and 11th can be detected); Wikipedia's record tables only have the top 10.
 */
export function finalise(
  key: string,
  title: string,
  subtitle: string,
  rows: Row[],
  resolve: Resolve,
): HistoryList {
  const problems: string[] = [];
  const top = rows.slice(0, LIST_SIZE);
  if (top.length < LIST_SIZE) problems.push(`only ${top.length} rows`);
  if (rows.length > LIST_SIZE && rows[LIST_SIZE - 1]!.value === rows[LIST_SIZE]!.value) {
    problems.push(
      `tie for 10th (${rows[LIST_SIZE - 1]!.person.name} / ${rows[LIST_SIZE]!.person.name})`,
    );
  }
  for (let i = 1; i < top.length; i++) {
    if (top[i]!.value > top[i - 1]!.value) {
      problems.push(`not in order at ${top[i]!.person.name}`);
      break;
    }
  }
  const entries: HistoryEntry[] = [];
  for (const r of top) {
    const id = resolve(r.person);
    if (id == null) {
      problems.push(`unmatched: ${r.person.name}`);
      continue;
    }
    if (entries.some((e) => e.playerId === id)) {
      problems.push(`listed twice: ${r.person.name}`);
      continue;
    }
    entries.push({ playerId: id, statLabel: r.label, era: r.era });
  }
  return { key, title, subtitle, entries, problems };
}

/** Sorts by value (descending) and drops non-positive values; ties keep their input order. */
const ranked = (rows: Row[]) => rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

const POSITIONS: Record<string, string> = {
  Goalkeeper: "goalkeepers",
  Defender: "defenders",
  Midfielder: "midfielders",
  Forward: "forwards",
  Winger: "forwards",
};

const ERAS: { key: string; from: number; to: number; label: string }[] = [
  { key: "pre1950", from: 0, to: 1949, label: "who joined before 1950" },
  { key: "1950-1979", from: 1950, to: 1979, label: "who joined between 1950 and 1979" },
  { key: "1980-1999", from: 1980, to: 1999, label: "who joined in the 1980s or 1990s" },
  { key: "2000-2009", from: 2000, to: 2009, label: "who joined in the 2000s" },
  { key: "2010", from: 2010, to: 9999, label: "who joined in 2010 or later" },
];

/** Total months in charge per person (several stints are added up). */
function tenures(rows: StaffRow[], resolve: Resolve, now: Date) {
  const nowMonths = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const byPerson = new Map<
    number,
    { person: PersonRef; months: number; honours: number; from: number; to: number }
  >();
  for (const r of rows) {
    if (!r.from) continue;
    const id = resolve(r.person);
    if (id == null) continue;
    const start = r.from.year * 12 + (r.from.month ?? 6) - 1;
    const end = r.to ? r.to.year * 12 + (r.to.month ?? 6) - 1 : nowMonths;
    const cur = byPerson.get(id) ?? {
      person: r.person,
      months: 0,
      honours: 0,
      from: r.from.year,
      to: r.from.year,
    };
    cur.months += Math.max(0, end - start);
    cur.honours += r.honours ?? 0;
    cur.from = Math.min(cur.from, r.from.year);
    cur.to = Math.max(cur.to, r.to?.year ?? now.getUTCFullYear());
    byPerson.set(id, cur);
  }
  return [...byPerson.values()];
}

const years = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? plural(y, "year") : "", m ? plural(m, "month") : ""].filter(Boolean).join(" ");
};

export function historyLists(
  src: HistorySources,
  resolve: Resolve,
  now = new Date(),
): HistoryList[] {
  const year = now.getUTCFullYear();
  const out: HistoryList[] = [];
  const WP = "Source: Wikipedia";

  // --- Club records (Wikipedia's own top-10 tables) -------------------------------------
  const record = (
    rows: RecordRow[],
    label: (r: RecordRow) => string,
    era: (r: RecordRow) => string | null,
  ) => rows.map((r) => ({ person: r.person, value: r.value, label: label(r), era: era(r) }));
  const careerEra = (r: RecordRow) => eraOfYears(r.years, year);
  // Lists built from the players table are skipped when fewer than 10 qualify; Wikipedia's
  // record tables always have 10, so a short one is a parsing problem and becomes a draft.
  const add = (key: string, title: string, subtitle: string, rows: Row[]) => {
    if (rows.length >= LIST_SIZE || /^wp:(apps|goals|signings|sales)/.test(key)) {
      out.push(finalise(key, title, subtitle, rows, resolve));
    }
  };

  const { records } = src;
  add(
    "wp:apps",
    "Most appearances for Barça, all-time",
    `All official competitions · ${WP}`,
    record(records.appsAll, (r) => plural(r.value, "app"), careerEra),
  );
  add(
    "wp:goals",
    "Barça's all-time top 10 scorers",
    `Official goals, all competitions · ${WP}`,
    record(records.goalsAll, (r) => plural(r.value, "goal"), careerEra),
  );
  add(
    "wp:goals:liga",
    "Barça's top 10 La Liga scorers",
    `League goals for Barça · ${WP}`,
    record(records.goalsLiga, (r) => plural(r.value, "goal"), careerEra),
  );
  add(
    "wp:goals:copa",
    "Most Copa del Rey goals for Barça",
    `Copa del Rey goals · ${WP}`,
    record(records.goalsCopa, (r) => plural(r.value, "goal"), careerEra),
  );
  add(
    "wp:goals:europe",
    "Barça's top scorers in Europe",
    `European & international club competitions · ${WP}`,
    record(records.goalsEurope, (r) => plural(r.value, "goal"), careerEra),
  );
  const transferYear = (r: RecordRow) => Number((r.note ?? "").match(/\d{4}/)?.[0]) || null;
  add(
    "wp:signings",
    "Barça's 10 most expensive signings",
    `Transfer fees paid · ${WP}`,
    record(
      records.signings,
      (r) => `${formatEuros(r.value * 1e6)} (${transferYear(r) ?? "?"})`,
      (r) => eraOf(transferYear(r), null),
    ),
  );
  add(
    "wp:sales",
    "Barça's 10 biggest sales",
    `Transfer fees received · ${WP}`,
    record(
      records.sales,
      (r) => `${formatEuros(r.value * 1e6)} (${transferYear(r) ?? "?"})`,
      (r) => eraOf(transferYear(r), null),
    ),
  );

  // --- Players with 100+ appearances (league apps/goals) --------------------------------
  const players = src.players.filter((p) => p.leagueApps != null);
  const pEra = (p: HistoryPlayer) => eraOf(p.from, p.to ?? year);
  const apps = (list: HistoryPlayer[]) =>
    ranked(
      list.map((p) => ({
        person: p.person,
        value: p.leagueApps!,
        label: plural(p.leagueApps!, "league app"),
        era: pEra(p),
      })),
    );
  const goals = (list: HistoryPlayer[]) =>
    ranked(
      list.map((p) => ({
        person: p.person,
        value: p.leagueGoals ?? 0,
        label: plural(p.leagueGoals ?? 0, "league goal"),
        era: pEra(p),
      })),
    );
  const LEAGUE = `League matches · players with 100+ Barça appearances · ${WP}`;

  const foreign = players.filter((p) => p.nationality && p.nationality !== "Spain");
  add(
    "wp:foreign:apps",
    "Foreign players with the most league games for Barça",
    LEAGUE,
    apps(foreign),
  );
  add(
    "wp:foreign:goals",
    "Foreign players with the most league goals for Barça",
    LEAGUE,
    goals(foreign),
  );
  add(
    "wp:spain:goals",
    "Spanish players with the most league goals for Barça",
    LEAGUE,
    goals(players.filter((p) => p.nationality === "Spain")),
  );

  const byNation = new Map<string, HistoryPlayer[]>();
  for (const p of foreign)
    byNation.set(p.nationality!, [...(byNation.get(p.nationality!) ?? []), p]);
  for (const [nation, list] of byNation) {
    if (list.length < LIST_SIZE) continue;
    const slug = nation.toLowerCase().replace(/[^a-z]+/g, "-");
    add(
      `wp:nation:${slug}:apps`,
      `Most league games for Barça by players from ${nation}`,
      LEAGUE,
      apps(list),
    );
  }

  const byPos = new Map<string, HistoryPlayer[]>();
  for (const p of players) {
    const pos = POSITIONS[p.position ?? ""];
    if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), p]);
  }
  for (const [pos, list] of byPos) {
    add(`wp:pos:${pos}:apps`, `Barça ${pos} with the most league games`, LEAGUE, apps(list));
    if (pos !== "goalkeepers" && pos !== "forwards") {
      add(`wp:pos:${pos}:goals`, `Barça ${pos} with the most league goals`, LEAGUE, goals(list));
    }
  }

  for (const e of ERAS) {
    const list = players.filter((p) => p.from != null && p.from >= e.from && p.from <= e.to);
    add(
      `wp:era:${e.key}:apps`,
      `Most league games for Barça by players ${e.label}`,
      LEAGUE,
      apps(list),
    );
    add(
      `wp:era:${e.key}:goals`,
      `Most league goals for Barça by players ${e.label}`,
      LEAGUE,
      goals(list),
    );
  }

  add(
    "wp:captains:apps",
    "Barça captains with the most league games",
    LEAGUE,
    apps(players.filter((p) => p.captain)),
  );

  add(
    "wp:ratio",
    "Barça's deadliest finishers",
    `League goals per game, min. 100 league games · ${WP}`,
    ranked(
      players
        .filter((p) => p.leagueApps! >= 100 && p.leagueGoals)
        .map((p) => {
          const ratio = Math.round((p.leagueGoals! / p.leagueApps!) * 100) / 100;
          return {
            person: p.person,
            value: ratio,
            label: `${ratio.toFixed(2)} goals per game`,
            era: pEra(p),
          };
        }),
    ),
  );

  // --- Seasons: top league scorer each season --------------------------------------------
  const seasonEra = (s: SeasonScorer) => eraOf(s.startYear, null);
  const best = new Map<string, Row>();
  const count = new Map<string, Row & { first: number; last: number }>();
  for (const s of src.seasons) {
    for (const p of s.scorers) {
      const k = p.title ?? p.name;
      if (s.goals != null && s.goals > (best.get(k)?.value ?? 0)) {
        best.set(k, {
          person: p,
          value: s.goals,
          label: `${plural(s.goals, "goal")} in ${s.season}`,
          era: seasonEra(s),
        });
      }
      const c = count.get(k) ?? {
        person: p,
        value: 0,
        label: "",
        era: null,
        first: s.startYear,
        last: s.startYear,
      };
      c.value++;
      c.last = s.startYear;
      count.set(k, c);
    }
  }
  const SEASONS = `La Liga seasons · ${WP}`;
  add(
    "wp:seasons:topscorer",
    "Most seasons as Barça's top league scorer",
    SEASONS,
    ranked(
      [...count.values()].map((c) => ({
        ...c,
        label: plural(c.value, "season"),
        era: eraOf(c.first, c.last),
      })),
    ),
  );
  add(
    "wp:seasons:best",
    "Barça's best single league seasons (one per player)",
    `Most league goals in a season by the club's top scorer · ${WP}`,
    ranked([...best.values()]),
  );

  // --- Managers and presidents -----------------------------------------------------------
  const staff = (rows: StaffRow[], role: string, plural_: string) => {
    const people = tenures(rows, resolve, now);
    const era = (t: (typeof people)[number]) => eraOf(t.from, t.to);
    add(
      `wp:${role}:tenure`,
      `Barça's longest-serving ${plural_}`,
      `Total time in charge, all spells · ${WP}`,
      ranked(
        people.map((t) => ({
          person: t.person,
          value: t.months,
          label: years(t.months),
          era: era(t),
        })),
      ),
    );
    add(
      `wp:${role}:honours`,
      `Barça ${plural_} with the most trophies`,
      `Official trophies won · ${WP}`,
      ranked(
        people.map((t) => ({
          person: t.person,
          value: t.honours,
          label: plural(t.honours, "trophy", "trophies"),
          era: era(t),
        })),
      ),
    );
  };
  staff(src.managers, "managers", "managers");
  staff(src.presidents, "presidents", "presidents");

  return out;
}
