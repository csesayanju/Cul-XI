import { rng } from "@/features/tiki-taka-toe/grid";

/**
 * Connections — pure rules (no I/O). Sixteen players hide four groups of four (a club, a
 * nation, a trophy…). Pick four that belong together; four mistakes and it's over.
 */

export const MAX_MISTAKES = 4;

export interface ConnectionsGroup {
  label: string;
  ids: number[];
}

export interface ConnectionsPuzzle {
  groups: ConnectionsGroup[];
  /** The 16 players in the order shown. */
  order: number[];
}

export interface GroupCandidate {
  label: string;
  /** Members, most famous first. */
  ids: readonly number[];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Builds a fair puzzle: four groups, each with four well-known players who belong to that
 * group only (so every player has exactly one right home). `pool` limits players to the
 * best known (`fameRank` = position in the overall fame order). Null if none is found.
 */
export function buildConnections(
  candidates: GroupCandidate[],
  seed: string,
  fameRank: ReadonlyMap<number, number>,
  maxRank = 600,
  attempts = 400,
): ConnectionsPuzzle | null {
  const random = rng(seed);
  const famous = (id: number) => (fameRank.get(id) ?? Infinity) < maxRank;
  const usable = candidates.filter((c) => c.ids.filter(famous).length >= 6);
  for (let t = 0; t < attempts; t++) {
    const picked = shuffle(usable, random).slice(0, 4);
    if (picked.length < 4) return null;
    const sets = picked.map((c) => new Set(c.ids));
    const groups: ConnectionsGroup[] = [];
    for (const [i, c] of picked.entries()) {
      // Members of this group and none of the other three.
      const only = c.ids.filter((id) => famous(id) && sets.every((s, j) => j === i || !s.has(id)));
      if (only.length < 4) break;
      // Mostly the best known, with a little variety from day to day.
      const top = shuffle(only.slice(0, 10), random).slice(0, 4);
      groups.push({ label: c.label, ids: top });
    }
    if (groups.length < 4) continue;
    return {
      groups,
      order: shuffle(
        groups.flatMap((g) => g.ids),
        random,
      ),
    };
  }
  return null;
}

export interface ConnectionsState {
  solved: number[];
  mistakes: number;
  finished: boolean;
}

export const NEW_CONNECTIONS: ConnectionsState = { solved: [], mistakes: 0, finished: false };

export type ConnectionsOutcome =
  | { kind: "correct"; group: number }
  | { kind: "one-away" }
  | { kind: "wrong" }
  | { kind: "invalid" }
  | { kind: "over" };

export function applyConnectionsGuess(
  puzzle: ConnectionsPuzzle,
  state: ConnectionsState,
  pick: number[],
): { state: ConnectionsState; outcome: ConnectionsOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  const ids = [...new Set(pick)];
  const open = puzzle.groups.map((_, i) => i).filter((i) => !state.solved.includes(i));
  const inPlay = new Set(open.flatMap((i) => puzzle.groups[i]!.ids));
  if (ids.length !== 4 || !ids.every((id) => inPlay.has(id))) {
    return { state, outcome: { kind: "invalid" } };
  }
  const best = open
    .map((i) => ({ i, hits: ids.filter((id) => puzzle.groups[i]!.ids.includes(id)).length }))
    .sort((a, b) => b.hits - a.hits)[0]!;
  if (best.hits === 4) {
    const solved = [...state.solved, best.i];
    return {
      state: { ...state, solved, finished: solved.length === puzzle.groups.length },
      outcome: { kind: "correct", group: best.i },
    };
  }
  const mistakes = state.mistakes + 1;
  return {
    state: { ...state, mistakes, finished: mistakes >= MAX_MISTAKES },
    outcome: best.hits === 3 ? { kind: "one-away" } : { kind: "wrong" },
  };
}
