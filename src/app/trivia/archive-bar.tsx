import Link from "next/link";

import { cx } from "@/components/ui";
import { shortDay } from "@/features/boards/period";
import type { ArchiveStatus } from "@/features/boards/server";

/**
 * Today plus the last 15 days of a daily game. Missed days can be played as practice (never
 * on leaderboards); days played live are locked but can be looked back at.
 */
export function ArchiveBar({
  path,
  day,
  today,
  days,
}: {
  path: string;
  day: string;
  today: string;
  days: { day: string; status: ArchiveStatus; finished: boolean }[];
}) {
  const practice = day !== today;
  const current = days.find((d) => d.day === day);
  return (
    <div className="mb-4 space-y-2">
      <nav
        aria-label="Past days"
        className="-mx-4 [scrollbar-width:none] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
      >
        <ul className="flex w-max gap-1.5">
          <li>
            <Link
              href={path}
              scroll={false}
              aria-current={!practice ? "page" : undefined}
              className={cx(
                "flex h-9 items-center rounded-full px-3.5 text-xs font-extrabold transition active:scale-95",
                !practice
                  ? "bg-gradient-to-br from-blaugrana-500 to-garnet-500 text-white"
                  : "border border-line bg-surface-raised text-ink",
              )}
            >
              Today
            </Link>
          </li>
          {days.map((d) => (
            <li key={d.day}>
              <Link
                href={`${path}?day=${d.day}`}
                scroll={false}
                aria-current={d.day === day ? "page" : undefined}
                title={
                  d.status === "live"
                    ? "Played live"
                    : d.status === "practice"
                      ? "Practised"
                      : "Not played yet"
                }
                className={cx(
                  "flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap transition active:scale-95",
                  d.day === day
                    ? "bg-brand text-brand-ink"
                    : "border border-line bg-surface-raised text-ink-muted hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "size-1.5 rounded-full",
                    d.status === "live"
                      ? "bg-gold-400"
                      : d.status === "practice"
                        ? "bg-volt"
                        : "bg-line",
                  )}
                />
                {shortDay(d.day)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {practice && (
        <p className="flex items-center gap-2 rounded-2xl border border-volt/40 bg-volt/10 px-3 py-2 text-xs font-semibold">
          <span aria-hidden>🕰️</span>
          {current?.status === "live"
            ? `You played ${shortDay(day)} live — here's how it went.`
            : `Archive: ${shortDay(day)}. Practice only — it won't count on leaderboards or streaks.`}
        </p>
      )}
    </div>
  );
}
