/**
 * Career Path — pure rules (no I/O). Each day everyone sees the same player's club career
 * (clubs and years, oldest first) and has 5 guesses to name him; each wrong guess unlocks a
 * hint.
 */

export const CAREER_GUESSES = 5;
/** Spells needed (after merging repeats) for a career to be a fair puzzle. */
export const MIN_SPELLS = 4;

export interface Spell {
  clubId: string;
  clubName: string;
  from: number | null;
  to: number | null;
}

/** Names that are national or youth national teams, not clubs. */
const NOT_A_CLUB = /national|under-\d|\bU-?\d{2}\b|olympic/i;

/**
 * Orders a player's spells, drops national teams, and merges back-to-back spells at the same
 * club (loans that ran on, split contracts). Spells without a start year go last.
 */
export function normaliseCareer(spells: Spell[]): Spell[] {
  const sorted = spells
    .filter((s) => !NOT_A_CLUB.test(s.clubName))
    .sort(
      (a, b) =>
        (a.from ?? 9999) - (b.from ?? 9999) ||
        (a.to ?? 9999) - (b.to ?? 9999) ||
        a.clubName.localeCompare(b.clubName),
    );
  const out: Spell[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && last.clubId === s.clubId) {
      last.to = s.to == null || last.to == null ? null : Math.max(last.to, s.to);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/** A good puzzle: enough spells, and every spell has a start year. */
export const isPlayable = (career: Spell[]) =>
  career.length >= MIN_SPELLS && career.every((s) => s.from != null);

export interface CareerState {
  guesses: number[];
  solved: boolean;
  finished: boolean;
}

export const NEW_CAREER: CareerState = { guesses: [], solved: false, finished: false };

export type CareerOutcome =
  { kind: "correct" } | { kind: "wrong" } | { kind: "repeat" } | { kind: "over" };

export function applyCareerGuess(
  state: CareerState,
  answerId: number,
  playerId: number,
): { state: CareerState; outcome: CareerOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (state.guesses.includes(playerId)) return { state, outcome: { kind: "repeat" } };
  const guesses = [...state.guesses, playerId];
  const solved = playerId === answerId;
  return {
    state: { guesses, solved, finished: solved || guesses.length >= CAREER_GUESSES },
    outcome: solved ? { kind: "correct" } : { kind: "wrong" },
  };
}

export interface CareerHints {
  nationality?: { name: string | null; code: string | null };
  position?: string | null;
  born?: number | null;
  initial?: string;
}

/** Hints unlocked so far: one per wrong guess (all once the game is over). */
export function unlockedHints(
  wrong: number,
  finished: boolean,
  p: {
    nationality: string | null;
    countryCode: string | null;
    position: string | null;
    birthYear: number | null;
    name: string;
  },
): CareerHints {
  const n = finished ? 4 : wrong;
  const hints: CareerHints = {};
  if (n >= 1) hints.nationality = { name: p.nationality, code: p.countryCode };
  if (n >= 2) hints.position = p.position;
  if (n >= 3) hints.born = p.birthYear;
  if (n >= 4) hints.initial = p.name.trim()[0]?.toUpperCase();
  return hints;
}

/**
 * The day's player: deterministic from the day among the candidates (most famous first),
 * skipping anyone used in the last `gapDays` days. Null if there's nobody.
 */
export function pickCareerPlayer(
  candidates: number[],
  recent: ReadonlySet<number>,
  seed: number,
): number | null {
  const fresh = candidates.filter((id) => !recent.has(id));
  const pool = fresh.length ? fresh : candidates;
  if (pool.length === 0) return null;
  return pool[Math.abs(seed) % pool.length]!;
}

/** A stable number for a day ("2026-10-31"), for seeding. */
export function daySeed(day: string): number {
  let h = 2166136261;
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
