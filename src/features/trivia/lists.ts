import { LIST_SIZE } from "./game";

/**
 * Builds Culé Ten lists from data (pure). Two kinds:
 *  - auto: from the current season's trusted data (Highlightly), frozen when scheduled;
 *  - drafts: from Wikidata's historical totals, which an admin reviews before use.
 */

export interface ListDraft {
  /** Stable key, e.g. "auto:goals" (template) or "wd:goals" (Wikidata draft). */
  key: string;
  title: string;
  subtitle: string;
  entries: { playerId: number; statLabel: string }[];
}

export interface CurrentPlayerStats {
  triviaPlayerId: number;
  name: string;
  marketValue: number | null;
  season: { games: number; minutes: number; goals: number; assists: number } | null;
}

interface Metric<T> {
  key: string;
  title: string;
  value: (p: T) => number | null;
  label: (v: number) => string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const formatEuros = (v: number) =>
  v >= 1_000_000 ? `€${Math.round(v / 100_000) / 10}m` : `€${Math.round(v / 1000)}k`;

/**
 * Top 10 by a metric, or null when it isn't a fair list: fewer than 10 players with a
 * positive value, or a tie between 10th and 11th (two right answers for one slot).
 */
export function topTen<T>(
  items: T[],
  value: (t: T) => number | null,
  id: (t: T) => number,
  label: (v: number) => string,
): { playerId: number; statLabel: string }[] | null {
  const ranked = items
    .map((t) => ({ t, v: value(t) }))
    .filter((x): x is { t: T; v: number } => x.v != null && x.v > 0)
    .sort((a, b) => b.v - a.v);
  if (ranked.length < LIST_SIZE) return null;
  if (ranked.length > LIST_SIZE && ranked[LIST_SIZE - 1]!.v === ranked[LIST_SIZE]!.v) return null;
  return ranked.slice(0, LIST_SIZE).map(({ t, v }) => ({ playerId: id(t), statLabel: label(v) }));
}

const SEASON_METRICS: Metric<CurrentPlayerStats>[] = [
  {
    key: "goals",
    title: "Barça's top 10 scorers this season",
    value: (p) => p.season?.goals ?? null,
    label: (v) => plural(v, "goal"),
  },
  {
    key: "assists",
    title: "Barça's top 10 assist providers this season",
    value: (p) => p.season?.assists ?? null,
    label: (v) => plural(v, "assist"),
  },
  {
    key: "involvements",
    title: "Most goals + assists for Barça this season",
    value: (p) => (p.season ? p.season.goals + p.season.assists : null),
    label: (v) => plural(v, "goal involvement"),
  },
  {
    key: "minutes",
    title: "Most minutes played for Barça this season",
    value: (p) => p.season?.minutes ?? null,
    label: (v) => `${v.toLocaleString("en-GB")} mins`,
  },
  {
    key: "games",
    title: "Most appearances for Barça this season",
    value: (p) => p.season?.games ?? null,
    label: (v) => plural(v, "app"),
  },
  {
    key: "value",
    title: "The 10 most valuable players in Barça's squad",
    value: (p) => p.marketValue,
    label: formatEuros,
  },
];

export const AUTO_TEMPLATES = SEASON_METRICS.map((m) => `auto:${m.key}`);

/** Auto lists for the current Barça squad (only the fair ones). */
export function autoLists(players: CurrentPlayerStats[], seasonLabel: string): ListDraft[] {
  const out: ListDraft[] = [];
  for (const m of SEASON_METRICS) {
    const entries = topTen(players, m.value, (p) => p.triviaPlayerId, m.label);
    if (!entries) continue;
    out.push({
      key: `auto:${m.key}`,
      title: m.title,
      subtitle:
        m.key === "value"
          ? "Latest market values"
          : `Season ${seasonLabel}, all competitions (as of today)`,
      entries,
    });
  }
  return out;
}

export interface HistoricPlayer {
  id: number;
  name: string;
  nationality: string | null;
  wdApps: number | null;
  wdGoals: number | null;
}

/**
 * Draft historical lists from Wikidata totals (Barça league matches). These are patchy, so
 * they're saved as drafts for an admin to check and fix before approving.
 */
export function wikidataDrafts(players: HistoricPlayer[], minPerNation = 12): ListDraft[] {
  const drafts: ListDraft[] = [];
  const add = (key: string, title: string, list: ReturnType<typeof topTen>) => {
    if (list) {
      drafts.push({
        key,
        title,
        subtitle: "League matches for Barça · drafted from Wikidata, please verify",
        entries: list,
      });
    }
  };
  add(
    "wd:goals",
    "Barça's top 10 all-time league scorers",
    topTen(
      players,
      (p) => p.wdGoals,
      (p) => p.id,
      (v) => plural(v, "goal"),
    ),
  );
  add(
    "wd:apps",
    "Most league appearances for Barça, all-time",
    topTen(
      players,
      (p) => p.wdApps,
      (p) => p.id,
      (v) => plural(v, "app"),
    ),
  );

  const byNation = new Map<string, HistoricPlayer[]>();
  for (const p of players) {
    if (!p.nationality || !p.wdApps) continue;
    byNation.set(p.nationality, [...(byNation.get(p.nationality) ?? []), p]);
  }
  for (const [nation, list] of [...byNation].sort((a, b) => b[1].length - a[1].length)) {
    if (nation === "Spain" || list.length < minPerNation) continue;
    add(
      `wd:apps:${nation.toLowerCase().replace(/[^a-z]+/g, "-")}`,
      `Most Barça league appearances by players from ${nation}`,
      topTen(
        list,
        (p) => p.wdApps,
        (p) => p.id,
        (v) => plural(v, "app"),
      ),
    );
  }
  return drafts;
}
