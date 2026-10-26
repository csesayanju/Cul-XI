import type { Position } from "./types";

/**
 * Performance-based player prices.
 *
 * Each player gets a 0–1 "form score" from their last few matches (minutes, match rating,
 * goal involvement), which maps onto a price band for their position. Bands were calibrated
 * on real 2026/27 data: an average XI of regular starters costs ~95–105 credits, the most
 * in-form XI ~108+, and fringe players 5–7 — so you can only afford stars by also picking
 * some value players.
 * Admin-set prices are locked and never re-priced automatically.
 */

/** Recent-form summary stored in `players.form`. */
export interface PlayerForm {
  /** How many of the team's recent matches were looked at. */
  matches: number;
  apps: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
  /** Average match rating (e.g. 7.2) across appearances with a rating, or null. */
  avgRating: number | null;
}

export const EMPTY_FORM: PlayerForm = {
  matches: 0,
  apps: 0,
  starts: 0,
  minutes: 0,
  goals: 0,
  assists: 0,
  avgRating: null,
};

export const PRICE_BANDS: Record<Position, { min: number; max: number }> = {
  GK: { min: 5.0, max: 9.5 },
  DEF: { min: 5.0, max: 10.5 },
  MID: { min: 5.5, max: 14.0 },
  FWD: { min: 6.0, max: 15.0 },
};

/** How much each factor counts, per position (each row sums to 1). */
const WEIGHTS: Record<Position, { availability: number; quality: number; threat: number }> = {
  GK: { availability: 0.45, quality: 0.55, threat: 0 },
  DEF: { availability: 0.4, quality: 0.45, threat: 0.15 },
  MID: { availability: 0.35, quality: 0.35, threat: 0.3 },
  FWD: { availability: 0.3, quality: 0.3, threat: 0.4 },
};

/** Goal involvements per match that count as "maxed out" threat, per position. */
const THREAT_CAP: Record<Position, number> = { GK: 1, DEF: 0.25, MID: 0.6, FWD: 0.8 };

/** Match ratings mapped to 0–1: 6.0 or lower = 0, 8.0 or higher = 1. */
const RATING_FLOOR = 6.0;
const RATING_CEIL = 8.0;

/** Score used when there's no recent data at all (new signing, long injury). */
const NO_DATA_SCORE = 0.2;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const roundHalf = (n: number) => Math.round(n * 2) / 2;

export function formScore(position: Position, form: PlayerForm): number {
  if (form.matches <= 0) return NO_DATA_SCORE;

  const availability = clamp01(form.minutes / (form.matches * 90));
  const quality =
    form.avgRating == null
      ? 0.25
      : clamp01((form.avgRating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR));
  const involvement = (form.goals + 0.7 * form.assists) / form.matches;
  const threat = clamp01(involvement / THREAT_CAP[position]);

  const w = WEIGHTS[position];
  return clamp01(w.availability * availability + w.quality * quality + w.threat * threat);
}

/** Price in credits (multiples of 0.5) for a player's position and recent form. */
export function priceFor(position: Position, form: PlayerForm = EMPTY_FORM): number {
  const { min, max } = PRICE_BANDS[position];
  return roundHalf(min + (max - min) * formScore(position, form));
}
