/**
 * Leaderboard scoring per trivia game (pure). Each live daily attempt scores points; a board
 * adds a player's points over the period. Endless games use the best streak in the period.
 */

export type DailyGame =
  "cule-ten" | "grid" | "mystery" | "connections" | "missing-xi" | "career" | "season";
export type EndlessGame = "higher-lower" | "odd-one-out";
export type BoardGame = DailyGame | EndlessGame;

export interface GameInfo {
  table: string;
  /** Columns the score needs. */
  columns: string;
  /** Points for one attempt row. */
  score: (row: Record<string, unknown>) => number;
  /** How a score reads, e.g. "7 found". */
  unit: string;
}

const len = (v: unknown) => (Array.isArray(v) ? v.length : 0);

export const DAILY_GAMES: Record<DailyGame, GameInfo> = {
  // Players found (0–10).
  "cule-ten": {
    table: "trivia_attempts",
    columns: "found",
    score: (r) => Number(r.found ?? 0),
    unit: "found",
  },
  // Squares filled (0–9).
  grid: {
    table: "ttt_attempts",
    columns: "filled",
    score: (r) => Number(r.filled ?? 0),
    unit: "squares",
  },
  // Solved: fewer guesses score higher (8 guesses: 8 points in one, 1 in eight).
  mystery: {
    table: "mystery_attempts",
    columns: "guesses, solved",
    score: (r) => (r.solved ? Math.max(1, 9 - len(r.guesses)) : 0),
    unit: "pts",
  },
  // Groups found count double, mistakes take one off (perfect = 8).
  connections: {
    table: "connections_attempts",
    columns: "solved, mistakes",
    score: (r) => Math.max(0, len(r.solved) * 2 - Number(r.mistakes ?? 0)),
    unit: "pts",
  },
  // Players found (0–11).
  "missing-xi": {
    table: "lineup_attempts",
    columns: "found",
    score: (r) => Number(r.found ?? 0),
    unit: "found",
  },
  // Solved: fewer guesses score higher (5 guesses: 5 points in one, 1 in five).
  career: {
    table: "career_attempts",
    columns: "guesses, solved",
    score: (r) => (r.solved ? Math.max(1, 6 - len(r.guesses)) : 0),
    unit: "pts",
  },
  // Solved: fewer guesses score higher (6 guesses: 6 points in one, 1 in six).
  season: {
    table: "season_attempts",
    columns: "guesses, solved",
    score: (r) => (r.solved ? Math.max(1, 7 - len(r.guesses)) : 0),
    unit: "pts",
  },
};

export const ENDLESS_TABLES: Record<EndlessGame, string> = {
  "higher-lower": "hol_scores",
  "odd-one-out": "ooo_scores",
};

export interface BoardRow {
  userId: string;
  score: number;
  played: number;
}

/** Adds up daily attempts per user (best first; ties: fewer games played first). */
export function tallyDaily(
  rows: (Record<string, unknown> & { user_id: string })[],
  score: GameInfo["score"],
): BoardRow[] {
  const by = new Map<string, BoardRow>();
  for (const r of rows) {
    const cur = by.get(r.user_id) ?? { userId: r.user_id, score: 0, played: 0 };
    cur.score += score(r);
    cur.played++;
    by.set(r.user_id, cur);
  }
  return [...by.values()].sort((a, b) => b.score - a.score || a.played - b.played);
}

/** Best streak per user over the period (from daily bests). */
export function tallyEndless(rows: { user_id: string; best: number }[]): BoardRow[] {
  const by = new Map<string, BoardRow>();
  for (const r of rows) {
    const cur = by.get(r.user_id) ?? { userId: r.user_id, score: 0, played: 0 };
    cur.score = Math.max(cur.score, Number(r.best));
    cur.played++;
    by.set(r.user_id, cur);
  }
  return [...by.values()].filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}
