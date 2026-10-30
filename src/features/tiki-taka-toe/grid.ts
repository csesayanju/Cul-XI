/**
 * Tiki-Taka-Toe — pure rules (no I/O). A daily 3×3 grid across all of La Liga: each row and
 * column is a category (a club, a nationality, a position, a trophy or a decade at Barça);
 * each cell needs a player who fits both. 9 guesses, each player used once.
 */

export const GUESSES = 9;
/** A cell needs at least this many possible answers to be fair. */
export const MIN_ANSWERS = 3;

export type Category =
  | { type: "club"; key: string; label: string }
  | { type: "nation"; key: string; label: string }
  | { type: "position"; key: "GK" | "DEF" | "MID" | "FWD"; label: string }
  | { type: "decade"; key: string; label: string }
  | { type: "award"; key: "pichichi" | "zamora" | "liga100"; label: string };

export interface GridPlayer {
  id: number;
  name: string;
  countryCode: string | null;
  nationality: string | null;
  position: string | null;
  /** Years at Barça (for the decade categories). */
  from: number | null;
  to: number | null;
  pichichis: number;
  zamoras: number;
  ligaGoals: number | null;
  clubs: ReadonlySet<string>;
}

export interface Grid {
  rows: Category[];
  cols: Category[];
  /** Per cell (row by row): how many answers exist and a few well-known ones (server only). */
  answers: { count: number; examples: number[] }[];
}

/** Famous clubs (Wikidata name -> what fans call them). Only these become categories. */
export const CLUB_NAMES: Record<string, string> = {
  "RCD Espanyol de Barcelona": "Espanyol",
  "Real Madrid Club de Fútbol": "Real Madrid",
  "Atlético Madrid": "Atlético Madrid",
  "Valencia CF": "Valencia",
  "Sevilla FC": "Sevilla",
  "Real Betis Balompié": "Real Betis",
  "Real Zaragoza": "Zaragoza",
  "RCD Mallorca": "Mallorca",
  "Deportivo de A Coruña": "Deportivo",
  "RC Celta de Vigo": "Celta Vigo",
  "Villarreal CF": "Villarreal",
  "Athletic Club": "Athletic Club",
  "Real Sociedad": "Real Sociedad",
  "Girona FC": "Girona",
  "Real Valladolid": "Valladolid",
  "Levante UD": "Levante",
  "Sporting de Gijón": "Sporting Gijón",
  "Club Atlético Osasuna": "Osasuna",
  "Deportivo Alavés": "Alavés",
  "Rayo Vallecano": "Rayo Vallecano",
  "Málaga CF": "Málaga",
  "Granada CF": "Granada",
  "Elche CF": "Elche",
  "Getafe CF": "Getafe",
  "UD Las Palmas": "Las Palmas",
  "AFC Ajax": "Ajax",
  "PSV Eindhoven": "PSV",
  "Feyenoord Rotterdam": "Feyenoord",
  "AC Milan": "AC Milan",
  "Inter Milan": "Inter",
  "Juventus FC": "Juventus",
  "SS Lazio": "Lazio",
  "AS Roma": "Roma",
  "ACF Fiorentina": "Fiorentina",
  "Paris Saint-Germain FC": "PSG",
  "AS Monaco FC": "Monaco",
  "Olympique de Marseille": "Marseille",
  "Olympique Lyonnais": "Lyon",
  "Arsenal F.C.": "Arsenal",
  "Liverpool F.C.": "Liverpool",
  "Chelsea F.C.": "Chelsea",
  "Tottenham Hotspur F.C.": "Tottenham",
  "Manchester City F.C.": "Man City",
  "Manchester United F.C.": "Man United",
  "Everton F.C.": "Everton",
  "FC Bayern Munich": "Bayern Munich",
  "Borussia Dortmund": "Dortmund",
  "S.L. Benfica": "Benfica",
  "FC Porto": "Porto",
  "Sporting CP": "Sporting CP",
  "Club Atlético River Plate": "River Plate",
  "Club Atlético Boca Juniors": "Boca Juniors",
  "Santos F.C.": "Santos",
  "Sociedade Esportiva Palmeiras": "Palmeiras",
  "S.C. Corinthians Paulista": "Corinthians",
  "Galatasaray S.K.": "Galatasaray",
  "Beşiktaş J.K.": "Beşiktaş",
};

const POSITION_LABELS = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
export const AWARD_LABELS = {
  pichichi: "Won the Pichichi",
  zamora: "Won the Zamora",
  liga100: "100+ La Liga goals",
} as const;

export function matches(p: GridPlayer, c: Category, now = new Date().getUTCFullYear()): boolean {
  switch (c.type) {
    case "club":
      return p.clubs.has(c.key);
    case "nation":
      return p.countryCode === c.key;
    case "position":
      return p.position === c.key;
    case "decade": {
      const d = Number(c.key);
      return p.from != null && p.from <= d + 9 && (p.to ?? now) >= d;
    }
    case "award":
      return c.key === "pichichi"
        ? p.pichichis > 0
        : c.key === "zamora"
          ? p.zamoras > 0
          : (p.ligaGoals ?? 0) >= 100;
  }
}

export const keyOf = (c: Pick<Category, "type" | "key">) => `${c.type}:${c.key}`;

/** Seeded PRNG (mulberry32), so a day always produces the same grid. */
export function rng(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Members of each candidate category, most famous first (from the database). */
export interface CategoryMembers {
  kind: Category["type"];
  key: string;
  ids: number[];
}

const nationName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Turns member sets into categories (only those with enough players). `clubLabels` maps a
 * club's Wikidata id to the name fans use; clubs without one are skipped.
 */
export function categories(
  members: CategoryMembers[],
  clubLabels: ReadonlyMap<string, string>,
  minPlayers = 8,
): { cats: Category[]; sets: Map<string, number[]> } {
  const cats: Category[] = [];
  const sets = new Map<string, number[]>();
  for (const m of members) {
    if (m.ids.length < minPlayers) continue;
    let c: Category | null = null;
    if (m.kind === "club") {
      const label = clubLabels.get(m.key);
      if (label) c = { type: "club", key: m.key, label };
    } else if (m.kind === "nation") {
      // Most players are Spanish, so "Spain" would make cells trivial.
      if (m.key !== "ES") c = { type: "nation", key: m.key, label: nationName(m.key) };
    } else if (m.kind === "position" && m.key in POSITION_LABELS) {
      const key = m.key as keyof typeof POSITION_LABELS;
      c = { type: "position", key, label: POSITION_LABELS[key] };
    } else if (m.kind === "decade") {
      c = { type: "decade", key: m.key, label: `At Barça in the ${m.key}s` };
    } else if (m.kind === "award" && m.key in AWARD_LABELS) {
      const key = m.key as keyof typeof AWARD_LABELS;
      c = { type: "award", key, label: AWARD_LABELS[key] };
    }
    if (!c) continue;
    cats.push(c);
    sets.set(keyOf(c), m.ids.map(Number));
  }
  return { cats, sets };
}

/** Member sets computed in memory (tests, or when the database function isn't available). */
export function membersFrom(players: GridPlayer[], cats: Category[]): CategoryMembers[] {
  return cats.map((c) => ({
    kind: c.type,
    key: c.key,
    ids: players.filter((p) => matches(p, c)).map((p) => p.id),
  }));
}

/** Clubs every fan knows: picked more often. */
const MARQUEE = new Set([
  "Barcelona",
  "Real Madrid",
  "Atlético Madrid",
  "Espanyol",
  "Valencia",
  "Sevilla",
  "Real Betis",
  "Villarreal",
  "Athletic Club",
  "Athletic Bilbao",
  "Real Sociedad",
  "Ajax",
  "PSV",
  "AC Milan",
  "Inter",
  "Juventus",
  "Roma",
  "PSG",
  "Monaco",
  "Marseille",
  "Liverpool",
  "Arsenal",
  "Chelsea",
  "Tottenham",
  "Man City",
  "Man United",
  "Bayern Munich",
  "Benfica",
  "Porto",
  "River Plate",
  "Santos",
]);

const WEIGHTS = { nation: 2, award: 2, decade: 1, position: 0.6 } as const;
const weight = (c: Category) =>
  c.type === "club" ? (MARQUEE.has(c.label) ? 6 : 1.5) : WEIGHTS[c.type];

type Weigh = (c: Category) => number;

function pick(cats: Category[], random: () => number, w: Weigh): Category | null {
  const total = cats.reduce((s, c) => s + w(c), 0);
  if (total === 0) return null;
  let r = random() * total;
  for (const c of cats) {
    r -= w(c);
    if (r <= 0) return c;
  }
  return cats[cats.length - 1] ?? null;
}

function overlap(a: ReadonlySet<number>, b: ReadonlySet<number>) {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let n = 0;
  for (const x of small) if (big.has(x)) n++;
  return n;
}

/** Picks `n` distinct categories: at most one position, one decade and one trophy overall. */
function pickMany(
  pool: Category[],
  n: number,
  taken: Category[],
  random: () => number,
  w: Weigh,
): Category[] | null {
  const out: Category[] = [];
  let candidates = [...pool];
  while (out.length < n) {
    const all = [...taken, ...out];
    candidates = candidates.filter(
      (c) =>
        !all.some((x) => keyOf(x) === keyOf(c)) &&
        !(
          (c.type === "position" || c.type === "decade" || c.type === "award") &&
          all.some((x) => x.type === c.type)
        ),
    );
    const c = pick(candidates, random, w);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/**
 * The day's grid. Rows are picked at random (well-known clubs most often), then columns from
 * the categories that give every cell at least MIN_ANSWERS answers with all three rows. At
 * least three clubs; at most one position, decade and trophy. `sets` lists each category's
 * members most famous first, so the examples are the best-known answers. Null if no fair grid.
 */
export function buildGrid(
  sets: ReadonlyMap<string, readonly number[]>,
  cats: Category[],
  seed: string,
  attempts = 500,
): Grid | null {
  const random = rng(seed);
  const lookup = new Map([...sets].map(([k, ids]) => [k, new Set(ids)]));
  const usable = cats.filter((c) => (lookup.get(keyOf(c))?.size ?? 0) >= MIN_ANSWERS);
  // Nations with few players make for obscure squares: pick them rarely.
  const w: Weigh = (c) =>
    weight(c) * (c.type === "nation" && lookup.get(keyOf(c))!.size < 60 ? 0.15 : 1);
  for (let i = 0; i < attempts; i++) {
    const rows = pickMany(usable, 3, [], random, w);
    if (!rows) continue;
    const fits = usable.filter((c) =>
      rows.every((r) => overlap(lookup.get(keyOf(r))!, lookup.get(keyOf(c))!) >= MIN_ANSWERS),
    );
    const cols = pickMany(fits, 3, rows, random, w);
    if (!cols) continue;
    if ([...rows, ...cols].filter((c) => c.type === "club").length < 3) continue;

    const answers = rows.flatMap((r) =>
      cols.map((c) => {
        const other = lookup.get(keyOf(c))!;
        const valid = sets.get(keyOf(r))!.filter((id) => other.has(id));
        return { count: valid.length, examples: valid.slice(0, 3) };
      }),
    );
    return { rows, cols, answers };
  }
  return null;
}

export interface TttState {
  /** Nine cells, row by row: player id or null. */
  cells: (number | null)[];
  guessesLeft: number;
  finished: boolean;
}

export const NEW_TTT: TttState = {
  cells: Array.from({ length: 9 }, () => null),
  guessesLeft: GUESSES,
  finished: false,
};

export type TttOutcome =
  { kind: "correct" } | { kind: "wrong" } | { kind: "used" } | { kind: "taken" } | { kind: "over" };

/** Applies one guess for a cell. `fits` = the player matches the cell's row and column. */
export function applyTtt(
  state: TttState,
  cell: number,
  playerId: number,
  fits: boolean,
): { state: TttState; outcome: TttOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (state.cells[cell] != null) return { state, outcome: { kind: "taken" } };
  if (state.cells.includes(playerId)) return { state, outcome: { kind: "used" } };
  const cells = [...state.cells];
  if (fits) cells[cell] = playerId;
  const guessesLeft = state.guessesLeft - 1;
  const filled = cells.filter((c) => c != null).length;
  return {
    state: { cells, guessesLeft, finished: guessesLeft <= 0 || filled === 9 },
    outcome: fits ? { kind: "correct" } : { kind: "wrong" },
  };
}

/**
 * Rarity score (lower is better, like Immaculate Grid): for each filled cell, the % of
 * players who picked the same answer there; 100 for each empty cell.
 */
export function rarityScore(cells: (number | null)[], percents: (number | null)[]): number {
  return Math.round(
    cells.reduce<number>((s, c, i) => s + (c == null ? 100 : (percents[i] ?? 0)), 0),
  );
}
