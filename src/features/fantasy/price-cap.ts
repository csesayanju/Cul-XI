/**
 * The price cap (pure): the most expensive legal XI from a match's pool may cost at most
 * `TEAM_RULES.maxTeamCost`. When it would cost more, every automatic price in the pool drops
 * by the same amount (0.5 steps), so gaps between players stay exactly as pricing set them.
 */
import { FORMATIONS } from "./formations";
import { TEAM_RULES } from "./scoring/rules";
import type { Position } from "./types";

/** Lowest price the cap may push a player to. */
export const PRICE_FLOOR = 5;

export interface PoolPlayer {
  id: number;
  team: number;
  position: Position;
  price: number;
  /** Admin-locked prices are never discounted. */
  locked: boolean;
}

const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

/** All ways to split `n` picks between `k` teams. */
function splits(n: number, k: number): number[][] {
  if (k === 0) return n === 0 ? [[]] : [];
  if (k === 1) return [[n]];
  const out: number[][] = [];
  for (let i = 0; i <= n; i++) for (const rest of splits(n - i, k - 1)) out.push([i, ...rest]);
  return out;
}

/**
 * Cost of the most expensive legal XI (any allowed formation, at most `maxPerTeam` per club),
 * or 0 when the pool can't make a legal XI.
 */
export function maxTeamCost(pool: PoolPlayer[], maxPerTeam: number = TEAM_RULES.maxPerTeam) {
  const teams = [...new Set(pool.map((p) => p.team))];
  // prefix[position][team][n] = cost of that team's n priciest players there.
  const prefix = new Map(
    POSITIONS.map((pos) => [
      pos,
      teams.map((t) =>
        pool
          .filter((p) => p.position === pos && p.team === t)
          .map((p) => p.price)
          .sort((a, b) => b - a)
          .reduce((acc, price) => [...acc, acc.at(-1)! + price], [0]),
      ),
    ]),
  );

  let best = 0;
  const walk = (i: number, counts: Record<Position, number>, used: number[], total: number) => {
    if (i === POSITIONS.length) {
      best = Math.max(best, total);
      return;
    }
    const pos = POSITIONS[i]!;
    const byTeam = prefix.get(pos)!;
    for (const split of splits(counts[pos], teams.length)) {
      if (split.some((n, t) => n >= byTeam[t]!.length || used[t]! + n > maxPerTeam)) continue;
      walk(
        i + 1,
        counts,
        used.map((u, t) => u + split[t]!),
        total + split.reduce((s, n, t) => s + byTeam[t]![n]!, 0),
      );
    }
  };
  for (const f of FORMATIONS)
    walk(
      0,
      f.counts,
      teams.map(() => 0),
      0,
    );
  return Math.round(best * 10) / 10;
}

const discounted = (p: PoolPlayer, by: number) =>
  p.locked ? p.price : Math.max(PRICE_FLOOR, p.price - by);

/** The smallest discount (multiple of 0.5) that brings the pool's priciest XI under the cap. */
export function capDiscount(pool: PoolPlayer[], cap: number = TEAM_RULES.maxTeamCost): number {
  for (let by = 0; by <= 10; by += 0.5) {
    if (maxTeamCost(pool.map((p) => ({ ...p, price: discounted(p, by) }))) <= cap) return by;
  }
  return 10;
}

/** A player's price after the largest discount among the pools they are in. */
export const cappedPrice = (p: PoolPlayer, discount: number) => discounted(p, discount);
