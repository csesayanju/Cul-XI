/**
 * Higher or Lower — pure rules (no I/O). You see player A's La Liga goals; does player B
 * have more or fewer? A right call continues the streak (B becomes A); a wrong one ends it.
 * Equal counts are right either way.
 */

export type HolPick = "higher" | "lower";

export function isRight(aValue: number, bValue: number, pick: HolPick): boolean {
  return pick === "higher" ? bValue >= aValue : bValue <= aValue;
}

/** A random player from `pool` other than those in `exclude` (null if none). */
export function nextOpponent(
  pool: readonly number[],
  exclude: readonly number[],
  random: () => number = Math.random,
): number | null {
  const choices = pool.filter((id) => !exclude.includes(id));
  if (choices.length === 0) return null;
  return choices[Math.floor(random() * choices.length)]!;
}

export interface HolRun {
  aId: number;
  bId: number;
  streak: number;
  best: number;
}

/**
 * Applies a call. Right: streak +1, B becomes A, a new B. Wrong: the streak resets (best is
 * kept) and a fresh pair starts.
 */
export function applyHol(
  run: HolRun,
  values: { a: number; b: number },
  pick: HolPick,
  pool: readonly number[],
  random: () => number = Math.random,
): { run: HolRun; right: boolean } {
  const right = isRight(values.a, values.b, pick);
  if (right) {
    const streak = run.streak + 1;
    const bId = nextOpponent(pool, [run.aId, run.bId], random) ?? run.aId;
    return { right, run: { aId: run.bId, bId, streak, best: Math.max(run.best, streak) } };
  }
  const aId = nextOpponent(pool, [run.aId, run.bId], random) ?? run.aId;
  const bId = nextOpponent(pool, [aId], random) ?? run.bId;
  return { right, run: { aId, bId, streak: 0, best: run.best } };
}
