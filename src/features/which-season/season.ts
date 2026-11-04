/**
 * "Which Season?" (pure): a hidden Barça season, revealed one clue at a time. Each guess is a
 * season; a miss says whether the answer is earlier or later and unlocks the next clue.
 */

export const SEASON_GUESSES = 6;
/** A season isn't repeated within this many days. */
export const SEASON_GAP_DAYS = 120;

export interface SeasonFacts {
  startYear: number;
  season: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  position: number;
  copa: string | null;
  europe: { competition: string; result: string } | null;
  topScorers: string[];
  topScorerGoals: number | null;
  /** That season's La Liga champion and Pichichi (from the champions list). */
  champion: string | null;
  pichichi: { names: string[]; clubs: string[]; goals: number | null } | null;
}

export interface Clue {
  label: string;
  value: string;
}

export interface SeasonState {
  guesses: number[];
  solved: boolean;
  finished: boolean;
}

export const NEW_SEASON_GAME: SeasonState = { guesses: [], solved: false, finished: false };

export type SeasonOutcome =
  | { kind: "correct" }
  | { kind: "wrong"; direction: "earlier" | "later"; off: number }
  | { kind: "repeat" }
  | { kind: "invalid" }
  | { kind: "over" };

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};

const isBarca = (club: string | null) => !!club && /barcelona|barça/i.test(club);

/** "2008–09" from 2008. */
export const seasonLabel = (start: number) =>
  `${start}–${String((start + 1) % 100).padStart(2, "0")}`;

/** The six clues, hardest first. */
export function allClues(f: SeasonFacts): Clue[] {
  return [
    {
      label: "League record",
      value: `W${f.won} D${f.drawn} L${f.lost} · ${f.goalsFor} scored, ${f.goalsAgainst} conceded`,
    },
    {
      label: "League finish",
      value:
        `Finished ${ordinal(f.position)} · ${f.points} pts` +
        (f.champion && !isBarca(f.champion) && f.position !== 1
          ? ` · champions: ${f.champion}`
          : ""),
    },
    { label: "Copa del Rey", value: f.copa ?? "Didn't take part" },
    {
      label: "Europe",
      value: f.europe ? `${f.europe.competition}: ${f.europe.result}` : "No European football",
    },
    {
      label: "Pichichi",
      value: f.pichichi?.names.length
        ? `${f.pichichi.names.join(" & ")}` +
          (f.pichichi.clubs.length ? ` (${f.pichichi.clubs.join(", ")})` : "") +
          (f.pichichi.goals != null ? ` · ${f.pichichi.goals} goals` : "")
        : "Unknown",
    },
    {
      label: "Barça top scorer",
      value: f.topScorers.length
        ? `${f.topScorers.join(" & ")}` +
          (f.topScorerGoals != null ? ` · ${f.topScorerGoals} league goals` : "")
        : "Unknown",
    },
  ];
}

/** One clue to start, one more per miss, all once the game is over. */
export function unlockedClues(f: SeasonFacts, state: SeasonState): Clue[] {
  const clues = allClues(f);
  if (state.finished) return clues;
  const misses = state.guesses.filter((g) => g !== f.startYear).length;
  return clues.slice(0, Math.min(clues.length, 1 + misses));
}

export function applySeasonGuess(
  state: SeasonState,
  answer: number,
  guess: number,
  valid: ReadonlySet<number>,
): { state: SeasonState; outcome: SeasonOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (!valid.has(guess)) return { state, outcome: { kind: "invalid" } };
  if (state.guesses.includes(guess)) return { state, outcome: { kind: "repeat" } };
  const guesses = [...state.guesses, guess];
  if (guess === answer) {
    return { state: { guesses, solved: true, finished: true }, outcome: { kind: "correct" } };
  }
  return {
    state: { guesses, solved: false, finished: guesses.length >= SEASON_GUESSES },
    outcome: {
      kind: "wrong",
      direction: answer < guess ? "earlier" : "later",
      off: Math.abs(answer - guess),
    },
  };
}

/** Per guess: right, or which way the answer lies (for the guess list). */
export function guessHints(guesses: number[], answer: number | null) {
  return guesses.map((g) => ({
    startYear: g,
    season: seasonLabel(g),
    result:
      answer == null
        ? null
        : g === answer
          ? ("right" as const)
          : answer < g
            ? ("earlier" as const)
            : ("later" as const),
    close: answer != null && g !== answer && Math.abs(answer - g) <= 3,
  }));
}

/** The day's season: seeded by the day, not one used recently. */
export function pickSeason(
  candidates: number[],
  recent: ReadonlySet<number>,
  seed: number,
): number | null {
  const fresh = candidates.filter((y) => !recent.has(y));
  const pool = fresh.length ? fresh : candidates;
  if (pool.length === 0) return null;
  return pool[Math.abs(seed) % pool.length]!;
}
