import { TEAM_RULES } from "./scoring/rules";
import type { Position } from "./types";

/** A formation as outfield counts, e.g. { DEF: 4, MID: 4, FWD: 2 } for 4-4-2. */
export interface Formation {
  name: string;
  counts: Record<Position, number>;
}

/** Every formation the team rules allow (1 GK + 10 outfield within each position's limits). */
export const FORMATIONS: Formation[] = (() => {
  const f = TEAM_RULES.formation;
  const outfield = TEAM_RULES.squadSize - f.GK.min;
  const list: Formation[] = [];
  for (let def = f.DEF.min; def <= f.DEF.max; def++) {
    for (let mid = f.MID.min; mid <= f.MID.max; mid++) {
      const fwd = outfield - def - mid;
      if (fwd < f.FWD.min || fwd > f.FWD.max) continue;
      list.push({
        name: `${def}-${mid}-${fwd}`,
        counts: { GK: f.GK.min, DEF: def, MID: mid, FWD: fwd },
      });
    }
  }
  return list;
})();

export const DEFAULT_FORMATION = FORMATIONS.find((f) => f.name === "4-4-2") ?? FORMATIONS[0]!;

/** The formation matching a saved team's position counts (falls back to the default). */
export function formationFor(counts: Partial<Record<Position, number>>): Formation {
  return (
    FORMATIONS.find(
      (f) =>
        f.counts.DEF === counts.DEF && f.counts.MID === counts.MID && f.counts.FWD === counts.FWD,
    ) ?? DEFAULT_FORMATION
  );
}

export type Slots = Record<Position, (number | null)[]>;

/** Fills a formation's slots with player ids, keeping order; extras beyond the slots are returned. */
export function fitToFormation(
  formation: Formation,
  idsByPosition: Record<Position, number[]>,
): { slots: Slots; dropped: number[] } {
  const slots = {} as Slots;
  const dropped: number[] = [];
  for (const pos of Object.keys(formation.counts) as Position[]) {
    const ids = idsByPosition[pos] ?? [];
    const n = formation.counts[pos];
    slots[pos] = Array.from({ length: n }, (_, i) => ids[i] ?? null);
    dropped.push(...ids.slice(n));
  }
  return { slots, dropped };
}
