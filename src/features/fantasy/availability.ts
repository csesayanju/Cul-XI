/** Injury reports and whether a player can be picked. */

export interface Injury {
  reason: string;
  /** ISO date (yyyy-mm-dd) the injury started, if known. */
  from: string | null;
  /** ISO date of the expected return, if known. */
  until: string | null;
}

export type InjuryOverride = "fit" | "injured" | null;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * True when a player can't be picked: an admin marked them injured, or the injury report is
 * current (no return date yet, or a return date today or later). An admin "fit" override wins.
 */
export function isUnavailable(
  injury: Injury | null | undefined,
  override: InjuryOverride | undefined,
  now = new Date(),
): boolean {
  if (override === "fit") return false;
  if (override === "injured") return true;
  if (!injury) return false;
  return injury.until == null || injury.until >= isoDay(now);
}

/** "Injured until 16 Nov · Hamstring injury" (or without a date / reason when unknown). */
export function injuryLabel(injury: Injury | null | undefined, override?: InjuryOverride): string {
  if (override === "injured" && !injury) return "Unavailable";
  const until = injury?.until
    ? ` until ${new Date(`${injury.until}T00:00:00Z`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })}`
    : "";
  const reason = injury?.reason && injury.reason !== "Unknown" ? ` · ${injury.reason}` : "";
  return `Injured${until}${reason}`;
}
