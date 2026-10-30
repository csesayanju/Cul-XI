import type { PersonRef } from "@/lib/wikipedia/barca-history";
import {
  countWins,
  type AwardWinner,
  type LigaRecords,
  type LigaRow,
  type LigaScorer,
} from "@/lib/wikipedia/la-liga";

import { LIST_SIZE } from "./game";
import { eraOf, finalise, type HistoryList, type Resolve } from "./history-lists";

/**
 * Culé Ten lists across all of La Liga (pure), from facts parsed from Wikipedia. Same checks
 * as the Barça history lists: a list that fails any becomes a draft for an admin.
 */

export interface LigaSources {
  scorers: LigaScorer[];
  records: LigaRecords;
  pichichi: AwardWinner[];
  zamora: AwardWinner[];
}

interface Row {
  person: PersonRef;
  value: number;
  label: string;
  era: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;

const eraOfYears = (years: string | null, now: number) => {
  const ys = [...(years ?? "").matchAll(/\d{4}/g)].map((m) => Number(m[0]));
  if (ys.length === 0) return null;
  const open = /[–-]\s*(present)?\s*$/.test((years ?? "").trim());
  return eraOf(Math.min(...ys), open ? now : Math.max(...ys));
};

const ranked = (rows: Row[]) => rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);

const DEBUT_ERAS = [
  { key: "pre1960", from: 0, to: 1959, label: "who debuted before 1960" },
  { key: "1960-1979", from: 1960, to: 1979, label: "who debuted in the 1960s or 70s" },
  { key: "1980-1999", from: 1980, to: 1999, label: "who debuted in the 1980s or 90s" },
  { key: "2000", from: 2000, to: 9999, label: "who debuted in 2000 or later" },
];

/**
 * @param countryOf nationality code of a resolved person (for "foreign" lists).
 */
export function ligaLists(
  src: LigaSources,
  resolve: Resolve,
  countryOf: (id: number) => string | null,
  now = new Date(),
): HistoryList[] {
  const year = now.getUTCFullYear();
  const out: HistoryList[] = [];
  const WP = "Source: Wikipedia";
  const add = (key: string, title: string, subtitle: string, rows: Row[], keepShort = false) => {
    if (rows.length >= LIST_SIZE || keepShort)
      out.push(finalise(key, title, subtitle, rows, resolve));
  };
  const table = (rows: LigaRow[], label: (v: number) => string) =>
    rows.map((r) => ({
      person: r.person,
      value: r.value,
      label: label(r.value),
      era: eraOfYears(r.years, year),
    }));

  // --- Records tables (Wikipedia's own ranking, top 30) ----------------------------------
  const { records } = src;
  add(
    "liga:goals",
    "La Liga's all-time top 10 scorers",
    `La Liga goals · ${WP}`,
    table(records.goals, (v) => plural(v, "goal")),
    true,
  );
  add(
    "liga:apps",
    "Most La Liga appearances, all-time",
    `La Liga matches · ${WP}`,
    table(records.apps, (v) => plural(v, "app")),
    true,
  );
  add(
    "liga:hattricks",
    "Most La Liga hat-tricks",
    `La Liga hat-tricks · ${WP}`,
    records.hatTricks.map((r) => ({
      person: r.person,
      value: r.value,
      label: plural(r.value, "hat-trick"),
      era: null,
    })),
    true,
  );
  add(
    "liga:coach:matches",
    "Most La Liga matches as a coach",
    `La Liga matches managed · ${WP}`,
    table(records.coachMatches, (v) => plural(v, "match", "matches")),
    true,
  );
  add(
    "liga:coach:wins",
    "Most La Liga wins as a coach",
    `La Liga matches won · ${WP}`,
    table(records.coachWins, (v) => plural(v, "win")),
    true,
  );
  add(
    "liga:coach:titles",
    "Coaches with the most La Liga titles",
    `La Liga titles · ${WP}`,
    records.coachTitles.map((r) => ({
      person: r.person,
      value: r.value,
      label: plural(r.value, "title"),
      era: eraOfYears(r.years, year),
    })),
    true,
  );

  // --- Pichichi and Zamora trophies -------------------------------------------------------
  const winners = (w: AwardWinner[], what: string) =>
    ranked(
      [...countWins(w).values()].map(({ person, wins }) => {
        const seasons = w.filter((s) =>
          s.winners.some((p) => (p.title ?? p.name) === (person.title ?? person.name)),
        );
        const years = seasons.map((s) => s.startYear);
        return {
          person,
          value: wins,
          label: plural(wins, what),
          era: eraOf(Math.min(...years), Math.max(...years)),
        };
      }),
    );
  add(
    "liga:pichichi:wins",
    "Most Pichichi trophies (La Liga top scorer)",
    `Pichichi Trophy · ${WP}`,
    winners(src.pichichi, "Pichichi"),
  );
  add(
    "liga:zamora:wins",
    "Most Zamora trophies (La Liga's best goalkeeper)",
    `Ricardo Zamora Trophy · ${WP}`,
    winners(src.zamora, "Zamora"),
  );

  const best = new Map<string, Row>();
  for (const s of src.pichichi) {
    if (s.goals == null) continue;
    for (const p of s.winners) {
      const k = p.title ?? p.name;
      if (s.goals > (best.get(k)?.value ?? 0)) {
        best.set(k, {
          person: p,
          value: s.goals,
          label: `${plural(s.goals, "goal")} in ${s.season}`,
          era: eraOf(s.startYear, null),
        });
      }
    }
  }
  add(
    "liga:pichichi:best",
    "Best Pichichi-winning seasons (one per player)",
    `Goals in the season they won the Pichichi · ${WP}`,
    ranked([...best.values()]),
  );

  // --- 100+ goal scorers (with debut year and clubs) --------------------------------------
  const scorerEra = (s: LigaScorer) => eraOf(s.first, s.last ?? year);
  const goals = (list: LigaScorer[]) =>
    ranked(
      list.map((s) => ({
        person: s.person,
        value: s.goals,
        label: plural(s.goals, "goal"),
        era: scorerEra(s),
      })),
    );
  const SCORERS = `La Liga goals · players with 100+ · ${WP}`;

  const foreign = src.scorers.filter((s) => {
    const id = resolve(s.person);
    const code = id == null ? null : countryOf(id);
    return code != null && code !== "ES";
  });
  add("liga:foreign:goals", "Foreign players with the most La Liga goals", SCORERS, goals(foreign));
  add(
    "liga:spain:goals",
    "Spanish players with the most La Liga goals",
    SCORERS,
    goals(
      src.scorers.filter((s) => {
        const id = resolve(s.person);
        return id != null && countryOf(id) === "ES";
      }),
    ),
  );

  for (const e of DEBUT_ERAS) {
    add(
      `liga:era:${e.key}:goals`,
      `Top La Liga scorers ${e.label}`,
      SCORERS,
      goals(src.scorers.filter((s) => s.first != null && s.first >= e.from && s.first <= e.to)),
    );
  }

  add(
    "liga:ratio",
    "La Liga's deadliest finishers",
    `Goals per game, min. 100 La Liga goals · ${WP}`,
    ranked(
      src.scorers
        .filter((s) => s.apps)
        .map((s) => {
          const ratio = Math.round((s.goals / s.apps!) * 100) / 100;
          return {
            person: s.person,
            value: ratio,
            label: `${ratio.toFixed(2)} goals per game`,
            era: scorerEra(s),
          };
        }),
    ),
  );

  // Club by club: who scored most for each club (among 100+ La Liga goal scorers).
  const byClub = new Map<string, { name: string; rows: Row[] }>();
  for (const s of src.scorers) {
    for (const c of s.clubs) {
      if (!c.club.title || c.goals == null) continue;
      const cur = byClub.get(c.club.title) ?? { name: c.club.name, rows: [] };
      cur.rows.push({
        person: s.person,
        value: c.goals,
        label: plural(c.goals, "goal"),
        era: scorerEra(s),
      });
      byClub.set(c.club.title, cur);
    }
  }
  for (const [title, { name, rows }] of byClub) {
    if (title === "FC Barcelona") continue; // Barça has its own, fuller lists
    // The source only lists players with 100+ La Liga goals in total. Anyone with 100+ for this
    // club is in it, so the top 10 is only certain when the 10th has 100+ for the club too.
    const top = ranked(rows);
    if (top.length < LIST_SIZE || top[LIST_SIZE - 1]!.value < 100) continue;
    const slug = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z]+/g, "-")
      .replace(/^-|-$/g, "");
    add(
      `liga:club:${slug}:goals`,
      `${name}'s top La Liga scorers`,
      `La Liga goals for ${name} · ${WP}`,
      top,
    );
  }

  return out;
}
