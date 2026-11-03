/**
 * Days and periods for trivia (pure). Days are "YYYY-MM-DD" in India time (see triviaDay).
 */

/** How many past days of each daily game can be played from the archive. */
export const ARCHIVE_DAYS = 15;

export type Period = "day" | "week" | "month";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

const toDate = (day: string) => new Date(`${day}T00:00:00Z`);
const toDay = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toDay(d);
}

/** The archive: yesterday back to 15 days ago, newest first. */
export function archiveDays(today: string, count = ARCHIVE_DAYS): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -(i + 1)));
}

/** Is `day` a valid archive day (a real date within the last 15 days, not today)? */
export function isArchiveDay(day: string | null | undefined, today: string): day is string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(toDate(day).getTime())) {
    return false;
  }
  return archiveDays(today).includes(day);
}

/** First day of the period containing `today` (weeks start on Monday). */
export function periodStart(period: Period, today: string): string {
  if (period === "day") return today;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  const weekday = (toDate(today).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(today, -weekday);
}

export const parsePeriod = (p: string | null | undefined): Period =>
  p === "week" || p === "month" ? p : "day";

/** "Sun 2 Nov" for an archive chip. */
export const shortDay = (day: string) =>
  toDate(day).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
