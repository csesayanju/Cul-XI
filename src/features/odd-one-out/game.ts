/**
 * Odd One Out — pure rules (no I/O). Four well-known players; three share something (played
 * for a club, won a trophy…) and one doesn't. Spot the odd one out; a right pick grows the
 * streak, a wrong one resets it.
 */

export interface OooCategory {
  /** e.g. "never played for Real Madrid". */
  prompt: string;
  /** Members, most famous first. */
  ids: readonly number[];
}

export interface OooRound {
  prompt: string;
  options: number[];
  answerId: number;
}

/**
 * A round: three famous members of a random category and one famous outsider, in random
 * order. Null if the category pool can't make one.
 */
export function makeRound(
  categories: OooCategory[],
  famous: readonly number[],
  random: () => number = Math.random,
  topMembers = 25,
): OooRound | null {
  const pickFrom = <T>(a: readonly T[]) => a[Math.floor(random() * a.length)]!;
  for (let t = 0; t < 50; t++) {
    const c = pickFrom(categories);
    const members = new Set(c.ids);
    const top = c.ids.slice(0, topMembers);
    if (top.length < 3) continue;
    const three = new Set<number>();
    while (three.size < 3) three.add(pickFrom(top));
    const outsiders = famous.filter((id) => !members.has(id));
    if (outsiders.length === 0) continue;
    const odd = pickFrom(outsiders);
    const options = [...three, odd];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [options[i], options[j]] = [options[j]!, options[i]!];
    }
    return { prompt: c.prompt, options, answerId: odd };
  }
  return null;
}

export interface OooScore {
  streak: number;
  best: number;
}

export function scoreOoo(score: OooScore, right: boolean): OooScore {
  const streak = right ? score.streak + 1 : 0;
  return { streak, best: Math.max(score.best, streak) };
}
