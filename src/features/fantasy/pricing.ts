import type { Position } from "./types";

/**
 * Default credit prices for players imported from the data provider (which has no prices).
 * Set so an all-Barça-heavy XI breaks the 100-credit budget and choices matter.
 * The admin can adjust individual prices afterwards; re-syncing never overwrites them.
 */
export const DEFAULT_PRICES: Record<Position, number> = {
  GK: 8.0,
  DEF: 8.5,
  MID: 9.5,
  FWD: 10.0,
};

/** Extra credits for Barça players, who usually score more in a Barça match. */
export const HOME_CLUB_PREMIUM = 1.0;

export function defaultPrice(position: Position, isBarca: boolean): number {
  return DEFAULT_PRICES[position] + (isBarca ? HOME_CLUB_PREMIUM : 0);
}
