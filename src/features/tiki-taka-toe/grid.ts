/**
 * Tiki-Taka-Toe — pure rules (no I/O). A daily 3×3 grid: each row and column is a category
 * (another club, a nationality, a position or a decade at Barça); each cell needs a Barça
 * player who fits both. 9 guesses, each player used once.
 */

export const GUESSES = 9;
/** A cell needs at least this many possible answers to be fair. */
export const MIN_ANSWERS = 3;

export type Category =
  | { type: "club"; key: string; label: string }
  | { type: "nation"; key: string; label: string }
  | { type: "position"; key: "GK" | "DEF" | "MID" | "FWD"; label: string }
  | { type: "decade"; key: string; label: string };

export interface GridPlayer {
  id: number;
  name: string;
  countryCode: string | null;
  nationality: string | null;
  position: string | null;
  from: number | null;
  to: number | null;
  apps: number | null;
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
  }
}

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

/** Every category with enough players to be worth using. */
export function categories(
  players: GridPlayer[],
  clubNames: ReadonlyMap<string, string>,
  minPlayers = 8,
): Category[] {
  const count = (pred: (p: GridPlayer) => boolean) => players.filter(pred).length;
  const out: Category[] = [];
  for (const [qid, name] of clubNames) {
    const label = CLUB_NAMES[name];
    if (label && count((p) => p.clubs.has(qid)) >= minPlayers) {
      out.push({ type: "club", key: qid, label });
    }
  }
  const nations = new Map<string, string>();
  for (const p of players)
    if (p.countryCode && p.nationality) nations.set(p.countryCode, p.nationality);
  for (const [code, name] of nations) {
    // Most Barça players are Spanish, so "Spain" would make cells trivial.
    if (code === "ES") continue;
    if (count((p) => p.countryCode === code) >= minPlayers) {
      out.push({ type: "nation", key: code, label: name });
    }
  }
  for (const pos of ["GK", "DEF", "MID", "FWD"] as const) {
    out.push({ type: "position", key: pos, label: POSITION_LABELS[pos] });
  }
  for (let d = 1950; d <= 2020; d += 10) {
    out.push({ type: "decade", key: String(d), label: `At Barça in the ${d}s` });
  }
  return out;
}

/** Clubs every fan knows: picked more often. */
const MARQUEE = new Set([
  "Real Madrid",
  "Atlético Madrid",
  "Espanyol",
  "Valencia",
  "Sevilla",
  "Real Betis",
  "Villarreal",
  "Athletic Club",
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

const weight = (c: Category) =>
  c.type === "club"
    ? MARQUEE.has(c.label)
      ? 5
      : 1
    : c.type === "nation"
      ? 2
      : c.type === "decade"
        ? 2
        : 1;

const keyOf = (c: Category) => `${c.type}:${c.key}`;

function pick(cats: Category[], random: () => number): Category | null {
  const total = cats.reduce((s, c) => s + weight(c), 0);
  if (total === 0) return null;
  let r = random() * total;
  for (const c of cats) {
    r -= weight(c);
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

/** Picks `n` distinct categories, keeping at most one position and one decade overall. */
function pickMany(
  pool: Category[],
  n: number,
  taken: Category[],
  random: () => number,
): Category[] | null {
  const out: Category[] = [];
  let candidates = [...pool];
  while (out.length < n) {
    const all = [...taken, ...out];
    candidates = candidates.filter(
      (c) =>
        !all.some((x) => keyOf(x) === keyOf(c)) &&
        !((c.type === "position" || c.type === "decade") && all.some((x) => x.type === c.type)),
    );
    const c = pick(candidates, random);
    if (!c) return null;
    out.push(c);
  }
  return out;
}

/**
 * The day's grid. Rows are picked at random (well-known clubs most often), then columns from
 * the categories that give every cell at least MIN_ANSWERS answers with all three rows. At
 * least two clubs, at most one position and one decade. Null if no fair grid is found.
 */
export function buildGrid(
  players: GridPlayer[],
  cats: Category[],
  seed: string,
  attempts = 500,
): Grid | null {
  const random = rng(seed);
  const sets = new Map(
    cats.map((c) => [keyOf(c), new Set(players.filter((p) => matches(p, c)).map((p) => p.id))]),
  );
  const usable = cats.filter((c) => sets.get(keyOf(c))!.size >= MIN_ANSWERS);
  for (let i = 0; i < attempts; i++) {
    const rows = pickMany(usable, 3, [], random);
    if (!rows) continue;
    const fits = usable.filter((c) =>
      rows.every((r) => overlap(sets.get(keyOf(r))!, sets.get(keyOf(c))!) >= MIN_ANSWERS),
    );
    const cols = pickMany(fits, 3, rows, random);
    if (!cols) continue;
    if ([...rows, ...cols].filter((c) => c.type === "club").length < 2) continue;

    const byId = new Map(players.map((p) => [p.id, p]));
    const answers = rows.flatMap((r) =>
      cols.map((c) => {
        const a = sets.get(keyOf(r))!;
        const b = sets.get(keyOf(c))!;
        const valid = [...a].filter((id) => b.has(id)).map((id) => byId.get(id)!);
        const examples = valid
          .sort((x, y) => (y.apps ?? 0) - (x.apps ?? 0))
          .slice(0, 3)
          .map((p) => p.id);
        return { count: valid.length, examples };
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
