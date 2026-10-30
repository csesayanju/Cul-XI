/**
 * Mystery Player — pure rules (no I/O). Guess the day's hidden player; each guess is
 * compared with the answer: nationality, position, birth year (older/younger), clubs in
 * common and whether they played for Barça. 8 guesses.
 */

export const MYSTERY_GUESSES = 8;

export interface MysteryPlayer {
  id: number;
  name: string;
  countryCode: string | null;
  nationality: string | null;
  position: string | null;
  birthYear: number | null;
  /** Club Wikidata ids → names. */
  clubs: ReadonlyMap<string, string>;
  barca: boolean;
}

export type Hit = "yes" | "no" | "unknown";

export interface Clue {
  playerId: number;
  name: string;
  countryCode: string | null;
  nation: { value: string | null; hit: Hit };
  position: { value: string | null; hit: Hit };
  /** "up" = the mystery player was born later (younger); "down" = earlier. */
  born: { value: number | null; hit: Hit; arrow: "up" | "down" | null; close: boolean };
  shared: { clubs: string[]; hit: Hit };
  barca: { value: boolean; hit: Hit };
  correct: boolean;
}

const same = <T>(a: T | null, b: T | null): Hit =>
  a == null || b == null ? "unknown" : a === b ? "yes" : "no";

/** How a guess compares with the answer. */
export function compare(guess: MysteryPlayer, answer: MysteryPlayer): Clue {
  const shared = [...guess.clubs.keys()]
    .filter((q) => answer.clubs.has(q))
    .map((q) => guess.clubs.get(q)!);
  const diff =
    guess.birthYear != null && answer.birthYear != null ? answer.birthYear - guess.birthYear : null;
  return {
    playerId: guess.id,
    name: guess.name,
    countryCode: guess.countryCode,
    nation: { value: guess.nationality, hit: same(guess.countryCode, answer.countryCode) },
    position: { value: guess.position, hit: same(guess.position, answer.position) },
    born: {
      value: guess.birthYear,
      hit: diff == null ? "unknown" : diff === 0 ? "yes" : "no",
      arrow: diff == null || diff === 0 ? null : diff > 0 ? "up" : "down",
      close: diff != null && diff !== 0 && Math.abs(diff) <= 3,
    },
    shared: { clubs: shared.sort(), hit: shared.length > 0 ? "yes" : "no" },
    barca: { value: guess.barca, hit: guess.barca === answer.barca ? "yes" : "no" },
    correct: guess.id === answer.id,
  };
}

export interface MysteryState {
  guesses: number[];
  solved: boolean;
  finished: boolean;
}

export const NEW_MYSTERY: MysteryState = { guesses: [], solved: false, finished: false };

export type MysteryOutcome =
  { kind: "correct" } | { kind: "wrong" } | { kind: "repeat" } | { kind: "over" };

export function applyMysteryGuess(
  state: MysteryState,
  answerId: number,
  playerId: number,
): { state: MysteryState; outcome: MysteryOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (state.guesses.includes(playerId)) return { state, outcome: { kind: "repeat" } };
  const guesses = [...state.guesses, playerId];
  const solved = playerId === answerId;
  return {
    state: { guesses, solved, finished: solved || guesses.length >= MYSTERY_GUESSES },
    outcome: solved ? { kind: "correct" } : { kind: "wrong" },
  };
}
