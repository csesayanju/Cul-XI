import { normalise } from "@/lib/wikipedia/player-photo";

/**
 * Matches a current player (as named by the data provider) to a repository record (from
 * Wikidata), so the same person isn't listed twice. Handles the usual differences:
 *  - initials: "F. de Jong" ~ "Frenkie de Jong";
 *  - short vs. full names: "Pau Cubarsí" ~ "Pau Cubarsí Paredes", "Fermín" ~ "Fermín López".
 */

const tokens = (s: string) => normalise(s).split(" ").filter(Boolean);

export interface MatchCandidate {
  id: number;
  /** All name variants (label + aliases), already normalised. */
  variants: string[];
  apps: number;
}

function variantMatches(variant: string, names: string[]): boolean {
  const v = tokens(variant);
  if (v.length === 0) return false;
  for (const name of names) {
    const n = tokens(name);
    if (n.length === 0) continue;
    // Exact.
    if (v.join(" ") === n.join(" ")) return true;
    // "f de jong" vs "frenkie de jong": every word matches, initials match first letters.
    if (
      v.length === n.length &&
      n.every(
        (t, i) =>
          t === v[i] ||
          (t.length === 1 && v[i]!.startsWith(t)) ||
          (v[i]!.length === 1 && t.startsWith(v[i]!)),
      )
    ) {
      return true;
    }
    // One is a multi-word subset of the other ("pau cubarsi" in "pau cubarsi paredes").
    const [short, long] = v.length <= n.length ? [v, n] : [n, v];
    if (short.length >= 2 && short.every((t) => long.includes(t))) return true;
    // Mononyms: "fermin" vs "fermin lopez" (first word, at least 5 letters to stay safe).
    if (short.length === 1 && short[0]!.length >= 5 && long[0] === short[0]) return true;
  }
  return false;
}

/** Best repository match for a current player, or null. Prefers the most-capped candidate. */
export function matchPlayer(
  names: (string | null | undefined)[],
  candidates: MatchCandidate[],
): MatchCandidate | null {
  const wanted = names.filter((n): n is string => !!n && n.trim().length > 0);
  const hits = candidates.filter((c) => c.variants.some((v) => variantMatches(v, wanted)));
  if (hits.length === 0) return null;
  return [...hits].sort((a, b) => b.apps - a.apps)[0]!;
}
