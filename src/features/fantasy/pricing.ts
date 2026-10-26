import type { Position } from "./types";

/**
 * Player prices (Dream11-style scale: roughly 7.5–11 credits, budget 100 for 11).
 *
 * price = band(position) × (65% status + 35% form)
 *  - status: the player's latest market value on a log scale (≈€1m → 0, €150m+ → 1), so a
 *    star in a quiet patch stays a star;
 *  - form: last 5 matches — minutes, match rating, goal involvement.
 * Without a known market value, status defaults to a typical squad player's.
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
  GK: { min: 7.5, max: 9.5 },
  DEF: { min: 7.5, max: 10.0 },
  MID: { min: 7.5, max: 11.0 },
  FWD: { min: 8.0, max: 11.0 },
};

/** Share of the price driven by status (market value); the rest is recent form. */
export const STATUS_WEIGHT = 0.65;
/** Status used when the market value is unknown (≈ a €5m squad player). */
export const UNKNOWN_STATUS = 0.32;
const VALUE_FLOOR = 1_000_000;
const VALUE_CEIL = 150_000_000;

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

/** Market value (euros) mapped to 0–1 on a log scale: €1m or less = 0, €150m or more = 1. */
export function statusScore(marketValue: number | null | undefined): number {
  if (marketValue == null || marketValue <= 0) return UNKNOWN_STATUS;
  return clamp01(
    Math.log10(Math.max(marketValue, VALUE_FLOOR) / VALUE_FLOOR) /
      Math.log10(VALUE_CEIL / VALUE_FLOOR),
  );
}

/** Price in credits (multiples of 0.5) for a player's position, recent form and market value. */
export function priceFor(
  position: Position,
  form: PlayerForm = EMPTY_FORM,
  marketValue?: number | null,
): number {
  const { min, max } = PRICE_BANDS[position];
  const score =
    STATUS_WEIGHT * statusScore(marketValue) + (1 - STATUS_WEIGHT) * formScore(position, form);
  return roundHalf(min + (max - min) * score);
}
