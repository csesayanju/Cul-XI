import Link from "next/link";

import { Card, cx, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { PERIODS, type Period } from "@/features/boards/period";
import type { BoardGame } from "@/features/boards/scores";
import { DAILY_GAMES } from "@/features/boards/scores";
import { loadBoard, isDailyGame } from "@/features/boards/server";
import { createClient } from "@/lib/supabase/server";

/**
 * A game's leaderboard: today / this week / this month, for one of the user's leagues
 * (live plays only — archive practice never counts).
 */
export async function TriviaBoard({
  game,
  userId,
  today,
  period,
  leagueId,
  path,
  day,
}: {
  game: BoardGame;
  userId: string;
  today: string;
  period: Period;
  leagueId?: string;
  path: string;
  /** Keep the archive day in links when switching tabs. */
  day?: string;
}) {
  const db = await createClient();
  const [league, rows] = await Promise.all([
    getMyLeague(db, userId, leagueId),
    loadBoard(db, game, period, today),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const shown = rows.filter((r) => r.userId === userId || names.has(r.userId)).slice(0, 25);
  const unit = isDailyGame(game) ? DAILY_GAMES[game].unit : "streak";

  const href = (p: Period, l?: string) => {
    const q = new URLSearchParams();
    if (day) q.set("day", day);
    if (p !== "day") q.set("period", p);
    if (l) q.set("league", l);
    const s = q.toString();
    return `${path}${s ? `?${s}` : ""}`;
  };

  return (
    <section className="mt-8">
      <SectionTitle aside={league ? (league.isGlobal ? "🌍 Global" : league.name) : undefined}>
        Leaderboard
      </SectionTitle>
      <div className="mb-2 grid grid-cols-3 gap-1 rounded-full border border-line bg-surface-raised p-1">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={href(p.key, leagueId)}
            scroll={false}
            aria-current={p.key === period ? "page" : undefined}
            className={cx(
              "rounded-full py-1.5 text-center text-xs font-extrabold transition active:scale-95",
              p.key === period ? "bg-brand text-brand-ink" : "text-ink-muted hover:text-ink",
            )}
          >
            {p.label}
          </Link>
        ))}
      </div>
      {league && league.all.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {league.all.map((l) => (
            <Link
              key={l.id}
              href={href(period, l.id)}
              scroll={false}
              className={cx(
                "rounded-full border px-3 py-1 text-xs font-bold transition",
                l.id === league.id
                  ? "border-transparent bg-accent text-accent-ink"
                  : "border-line text-ink-muted hover:text-ink",
              )}
            >
              {l.isGlobal ? "🌍 Global" : l.name}
            </Link>
          ))}
        </div>
      )}
      <Card className="p-0">
        {shown.length === 0 ? (
          <p className="p-4 text-center text-sm text-ink-muted">
            Nobody on the board yet. Be the first 👀
          </p>
        ) : (
          <ol className="divide-y divide-line text-sm">
            {shown.map((r, i) => (
              <li
                key={r.userId}
                className={cx(
                  "flex items-center gap-3 px-3 py-2.5",
                  r.userId === userId && "bg-gold-400/10",
                )}
              >
                <span
                  className={cx(
                    "tabular flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-black",
                    i === 0
                      ? "bg-gold-400 text-blaugrana-950"
                      : i === 1
                        ? "bg-blaugrana-100 text-blaugrana-900"
                        : i === 2
                          ? "bg-garnet-100 text-garnet-900"
                          : "text-ink-muted",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {r.userId === userId ? "You" : names.get(r.userId)}
                </span>
                {isDailyGame(game) && period !== "day" && (
                  <span className="text-xs text-ink-muted">{r.played}d</span>
                )}
                <span className="tabular font-display text-lg font-extrabold">
                  {r.score}
                  <span className="ml-1 text-[11px] font-semibold text-ink-muted">{unit}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  );
}
