/**
 * Culé Ten — pure game rules (no I/O), shared by the server actions and tests.
 * Name the 10 players in today's ranked list; each slot shows a nationality hint;
 * a wrong guess costs a life; the game ends when all 10 are found or lives run out.
 */

export const LIST_SIZE = 10;
export const LIVES = 3;
/** The daily list changes at midnight in this timezone (the group is in India). */
export const TRIVIA_TIMEZONE = "Asia/Kolkata";

export interface TriviaEntry {
  rank: number;
  playerId: number;
  name: string;
  nationality: string | null;
  countryCode: string | null;
  statLabel: string | null;
}

export interface Guess {
  playerId: number;
  /** Rank found, or null for a wrong guess. */
  rank: number | null;
}

export interface AttemptState {
  guesses: Guess[];
  found: number;
  livesLeft: number;
  finished: boolean;
}

export const NEW_ATTEMPT: AttemptState = {
  guesses: [],
  found: 0,
  livesLeft: LIVES,
  finished: false,
};

export type GuessOutcome =
  { kind: "correct"; rank: number } | { kind: "wrong" } | { kind: "repeat" } | { kind: "over" };

/** Applies one guess. Never mutates the input state. */
export function applyGuess(
  entries: TriviaEntry[],
  state: AttemptState,
  playerId: number,
): { state: AttemptState; outcome: GuessOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (state.guesses.some((g) => g.playerId === playerId)) {
    return { state, outcome: { kind: "repeat" } };
  }

  const hit = entries.find((e) => e.playerId === playerId);
  const guesses = [...state.guesses, { playerId, rank: hit?.rank ?? null }];
  const found = guesses.filter((g) => g.rank != null).length;
  const livesLeft = hit ? state.livesLeft : state.livesLeft - 1;
  const finished = found >= Math.min(LIST_SIZE, entries.length) || livesLeft <= 0;

  return {
    state: { guesses, found, livesLeft, finished },
    outcome: hit ? { kind: "correct", rank: hit.rank } : { kind: "wrong" },
  };
}

export interface SlotView {
  rank: number;
  hint: { nationality: string | null; flag: string | null };
  /** Set once found, or for every slot when the game is over. */
  answer: { name: string; statLabel: string | null; found: boolean } | null;
}

/**
 * What the player is allowed to see: hints for every slot, plus answers they've found (or all
 * answers once the game is over). Answers are never sent before that.
 */
export function publicView(entries: TriviaEntry[], state: AttemptState): SlotView[] {
  const foundRanks = new Set(state.guesses.filter((g) => g.rank != null).map((g) => g.rank));
  return [...entries]
    .sort((a, b) => a.rank - b.rank)
    .map((e) => {
      const found = foundRanks.has(e.rank);
      return {
        rank: e.rank,
        hint: { nationality: e.nationality, flag: flagEmoji(e.countryCode) },
        answer: found || state.finished ? { name: e.name, statLabel: e.statLabel, found } : null,
      };
    });
}

/** "ES" -> 🇪🇸 (regional indicator symbols); null for missing/invalid codes. */
export function flagEmoji(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** Calendar day (YYYY-MM-DD) in the trivia timezone. */
export function triviaDay(now = new Date(), timeZone = TRIVIA_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Consecutive days played up to `today` (or yesterday, if today isn't played yet). */
export function streak(daysPlayed: string[], today: string): number {
  const played = new Set(daysPlayed);
  const prev = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - 1);
    return t.toISOString().slice(0, 10);
  };
  let day = played.has(today) ? today : prev(today);
  let count = 0;
  while (played.has(day)) {
    count++;
    day = prev(day);
  }
  return count;
}

export interface ListCandidate {
  id: string;
  kind: "auto" | "curated";
}

/**
 * Picks today's list: an approved curated list unused for the longest (and not in the last
 * 45 days) is preferred; otherwise the least recently used auto list. `lastUsed` maps list id
 * -> last day it was scheduled. Deterministic for a given input.
 */
export function pickDailyList(
  candidates: ListCandidate[],
  lastUsed: ReadonlyMap<string, string>,
  today: string,
): ListCandidate | null {
  const daysSince = (id: string) => {
    const d = lastUsed.get(id);
    if (!d) return Number.POSITIVE_INFINITY;
    return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000;
  };
  const byStaleness = (list: ListCandidate[]) =>
    [...list].sort((a, b) => daysSince(b.id) - daysSince(a.id) || a.id.localeCompare(b.id));

  const curated = byStaleness(candidates.filter((c) => c.kind === "curated")).filter(
    (c) => daysSince(c.id) > 45,
  );
  if (curated.length > 0) return curated[0]!;
  const auto = byStaleness(candidates.filter((c) => c.kind === "auto"));
  return auto[0] ?? byStaleness(candidates)[0] ?? null;
}
