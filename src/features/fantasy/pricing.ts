import type { Position } from "./types";

/**
 * Player prices (Dream11-style scale: roughly 7–11.5 credits, budget 100 for 11).
 *
 * price = band(position) × score. Position sets the band (GK/DEF low, MID/FWD high); the
 * score places the player within it by blending four signals:
 *  - 50% status       — latest market value on a log scale (≈€1m → 0, €150m+ → 1), so a star
 *                       in a quiet patch stays a star;
 *  - 25% season       — current-season minutes share, goals + assists per game, clean sheets;
 *  - 15% last 30 days — minutes, match ratings, goal involvement (up to 5 matches);
 *  - 10% last match   — the same, for the team's most recent match.
 * Missing signals: no season stats → its weight is shared out among the others (so form
 * can't dominate); no last match → the 30-day form stands in; no market value → a typical
 * squad player's status. Admin-set prices are locked and never re-priced.
 */

/** Recent-form summary (stored in `players.form` for 30 days, `players.last_match` for 1 match). */
export interface PlayerForm {
  /** How many of the team's matches the window covers. */
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

/** Current-season totals across competitions (stored in `players.season_stats`). */
export interface SeasonStats {
  /** e.g. "26/27" */
  season: string;
  games: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  /** Matches the player's team has played this season (approximation), for minutes share. */
  teamGames: number;
}

export interface PriceInputs {
  marketValue?: number | null;
  season?: SeasonStats | null;
  /** Last 30 days. */
  form?: PlayerForm | null;
  last?: PlayerForm | null;
}

/**
 * Position sets the price range (Dream11-style): goalkeepers and defenders are cheaper,
 * midfielders and strikers — who score more fantasy points — cost more. The player's
 * score then places them within their position's range.
 */
export const PRICE_BANDS: Record<Position, { min: number; max: number }> = {
  GK: { min: 7.0, max: 9.0 },
  DEF: { min: 7.0, max: 9.5 },
  MID: { min: 8.0, max: 11.0 },
  FWD: { min: 8.5, max: 11.5 },
};

export const PRICE_WEIGHTS = { status: 0.5, season: 0.25, month: 0.15, last: 0.1 } as const;

/** Status used when the market value is unknown (≈ a €5m squad player). */
export const UNKNOWN_STATUS = 0.32;
const VALUE_FLOOR = 1_000_000;
const VALUE_CEIL = 150_000_000;

/** How much each factor counts in a form window, per position (each row sums to 1). */
const FORM_WEIGHTS: Record<Position, { availability: number; quality: number; threat: number }> = {
  GK: { availability: 0.45, quality: 0.55, threat: 0 },
  DEF: { availability: 0.4, quality: 0.45, threat: 0.15 },
  MID: { availability: 0.35, quality: 0.35, threat: 0.3 },
  FWD: { availability: 0.3, quality: 0.3, threat: 0.4 },
};

/** How much each factor counts over a season, per position (each row sums to 1). */
const SEASON_WEIGHTS: Record<Position, { availability: number; threat: number; defence: number }> =
  {
    GK: { availability: 0.5, threat: 0, defence: 0.5 },
    DEF: { availability: 0.45, threat: 0.2, defence: 0.35 },
    MID: { availability: 0.4, threat: 0.5, defence: 0.1 },
    FWD: { availability: 0.35, threat: 0.65, defence: 0 },
  };

/** Goal involvements per match that count as "maxed out" threat, per position. */
const THREAT_CAP: Record<Position, number> = { GK: 1, DEF: 0.25, MID: 0.6, FWD: 0.8 };
/** Clean sheets per game that count as "maxed out" defence. */
const CLEAN_SHEET_CAP = 0.5;

/** Match ratings mapped to 0–1: 6.0 or lower = 0, 8.0 or higher = 1. */
const RATING_FLOOR = 6.0;
const RATING_CEIL = 8.0;

/** Score used when there's no recent data at all (new signing, long injury). */
const NO_DATA_SCORE = 0.2;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const roundHalf = (n: number) => Math.round(n * 2) / 2;
const involvement = (goals: number, assists: number) => goals + 0.7 * assists;

/** 0–1 score for a form window (30 days or last match). */
export function formScore(position: Position, form: PlayerForm): number {
  if (form.matches <= 0) return NO_DATA_SCORE;

  const availability = clamp01(form.minutes / (form.matches * 90));
  const quality =
    form.avgRating == null
      ? 0.25
      : clamp01((form.avgRating - RATING_FLOOR) / (RATING_CEIL - RATING_FLOOR));
  const threat = clamp01(
    involvement(form.goals, form.assists) / form.matches / THREAT_CAP[position],
  );

  const w = FORM_WEIGHTS[position];
  return clamp01(w.availability * availability + w.quality * quality + w.threat * threat);
}

/** 0–1 score for the current season, or null when there's nothing to go on yet. */
export function seasonScore(position: Position, s: SeasonStats | null | undefined): number | null {
  if (!s || s.games <= 0) return null;
  const teamGames = Math.max(s.teamGames, s.games, 1);
  const availability = clamp01(s.minutes / (teamGames * 90));
  const threat = clamp01(involvement(s.goals, s.assists) / s.games / THREAT_CAP[position]);
  const defence = clamp01(s.cleanSheets / s.games / CLEAN_SHEET_CAP);
  const w = SEASON_WEIGHTS[position];
  return clamp01(w.availability * availability + w.threat * threat + w.defence * defence);
}

/** Market value (euros) mapped to 0–1 on a log scale: €1m or less = 0, €150m or more = 1. */
export function statusScore(marketValue: number | null | undefined): number {
  if (marketValue == null || marketValue <= 0) return UNKNOWN_STATUS;
  return clamp01(
    Math.log10(Math.max(marketValue, VALUE_FLOOR) / VALUE_FLOOR) /
      Math.log10(VALUE_CEIL / VALUE_FLOOR),
  );
}

/** The blended 0–1 score behind a price. */
export function priceScore(position: Position, inputs: PriceInputs = {}): number {
  const month = formScore(position, inputs.form ?? EMPTY_FORM);
  const season = seasonScore(position, inputs.season);
  const last = inputs.last ? formScore(position, inputs.last) : month;
  const w = PRICE_WEIGHTS;
  const parts: [number, number][] = [
    [w.status, statusScore(inputs.marketValue)],
    [w.month, month],
    [w.last, last],
    ...(season == null ? [] : ([[w.season, season]] as [number, number][])),
  ];
  const totalWeight = parts.reduce((sum, [weight]) => sum + weight, 0);
  return clamp01(parts.reduce((sum, [weight, score]) => sum + weight * score, 0) / totalWeight);
}

/** Price in credits (multiples of 0.5). */
export function priceFor(position: Position, inputs: PriceInputs = {}): number {
  const { min, max } = PRICE_BANDS[position];
  return roundHalf(min + (max - min) * priceScore(position, inputs));
}
