import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCareerDay } from "@/features/career/server";
import { ensureConnectionsDay } from "@/features/connections/server";
import { ensureXiDay } from "@/features/missing-xi/server";
import { ensureMysteryDay } from "@/features/mystery/server";
import { ensureGrid } from "@/features/tiki-taka-toe/server";
import { ensureDaily } from "@/features/trivia/server";

import { archiveDays, isArchiveDay, periodStart, type Period } from "./period";
import {
  DAILY_GAMES,
  ENDLESS_TABLES,
  tallyDaily,
  tallyEndless,
  type BoardGame,
  type BoardRow,
  type DailyGame,
  type EndlessGame,
} from "./scores";

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

export const isDailyGame = (g: string): g is DailyGame => g in DAILY_GAMES;

/** Makes sure the day's puzzle exists (archive days are generated on first visit). */
export async function ensureDay(
  db: SupabaseClient,
  game: DailyGame,
  day: string,
  config: { barcaTeamId: number; season: number },
) {
  switch (game) {
    case "cule-ten":
      return (await ensureDaily(db, day, config)) != null;
    case "grid":
      return (await ensureGrid(db, day)) != null;
    case "mystery":
      return (await ensureMysteryDay(db, day)) != null;
    case "connections":
      return (await ensureConnectionsDay(db, day)) != null;
    case "missing-xi":
      return (await ensureXiDay(db, day)) != null;
    case "career":
      return (await ensureCareerDay(db, day)) != null;
  }
}

/**
 * Can this user play this day? Today: yes. An archive day (last 15): only if they didn't play
 * it live (a live attempt stays as it was). Anything else: no.
 */
export async function playable(
  db: SupabaseClient,
  game: DailyGame,
  userId: string,
  day: string,
  today: string,
): Promise<{ ok: true; practice: boolean } | { ok: false; message: string }> {
  if (day === today) return { ok: true, practice: false };
  if (!isArchiveDay(day, today)) {
    return { ok: false, message: "That day isn't in the archive (last 15 days only)." };
  }
  const { data } = await db
    .from(DAILY_GAMES[game].table)
    .select("live")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (data?.live) return { ok: false, message: "You played this day live — it's locked." };
  return { ok: true, practice: true };
}

/**
 * Gives up: ends the game and reveals the answers. A live day keeps the score so far (like
 * running out of lives); an archive day is practice either way.
 */
export async function giveUp(
  db: SupabaseClient,
  game: DailyGame,
  userId: string,
  day: string,
  config: { barcaTeamId: number; season: number },
) {
  if (!(await ensureDay(db, game, day, config))) return false;
  check(
    await db
      .from(DAILY_GAMES[game].table)
      .upsert(
        { user_id: userId, day, finished: true, gave_up: true },
        { onConflict: "user_id,day" },
      ),
    "give up",
  );
  return true;
}

export type ArchiveStatus = "live" | "practice" | "open";

/** The user's status on each archive day: played live (locked), practised, or open. */
export async function archiveStatus(
  db: SupabaseClient,
  game: DailyGame,
  userId: string,
  today: string,
): Promise<{ day: string; status: ArchiveStatus; finished: boolean }[]> {
  const days = archiveDays(today);
  const { data } = await db
    .from(DAILY_GAMES[game].table)
    .select("day, live, finished")
    .eq("user_id", userId)
    .gte("day", days.at(-1)!)
    .lt("day", today);
  const byDay = new Map((data ?? []).map((r) => [r.day as string, r]));
  return days.map((day) => {
    const r = byDay.get(day);
    return {
      day,
      status: !r ? "open" : r.live ? "live" : "practice",
      finished: !!r?.finished,
    };
  });
}

/** A leaderboard for one game over a period (live plays only; RLS limits rows). */
export async function loadBoard(
  db: SupabaseClient,
  game: BoardGame,
  period: Period,
  today: string,
): Promise<BoardRow[]> {
  const from = periodStart(period, today);
  if (isDailyGame(game)) {
    const info = DAILY_GAMES[game];
    const rows = check(
      await db
        .from(info.table)
        .select(`user_id, ${info.columns}`)
        .eq("live", true)
        .gte("day", from)
        .lte("day", today),
      "load board",
    ) as unknown as (Record<string, unknown> & { user_id: string })[];
    return tallyDaily(rows, info.score);
  }
  const rows = check(
    await db
      .from(ENDLESS_TABLES[game as EndlessGame])
      .select("user_id, best")
      .gte("day", from)
      .lte("day", today),
    "load board",
  ) as { user_id: string; best: number }[];
  return tallyEndless(rows);
}

/** Records today's best streak for an endless game (server only). */
export async function recordStreak(
  db: SupabaseClient,
  game: EndlessGame,
  userId: string,
  day: string,
  streak: number,
) {
  if (streak <= 0) return;
  const table = ENDLESS_TABLES[game];
  const { data } = await db
    .from(table)
    .select("best")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  if (data && Number(data.best) >= streak) return;
  check(
    await db
      .from(table)
      .upsert({ user_id: userId, day, best: streak }, { onConflict: "user_id,day" }),
    "record streak",
  );
}
