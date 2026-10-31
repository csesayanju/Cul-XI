import "server-only";

import { createSyncContext, HOUR, type SyncContext } from "./context";
import { syncLineups } from "./sync-lineups";
import { syncStats } from "./sync-stats";

/**
 * Keeps a match fresh when people open the app around it, because GitHub's scheduled runs
 * can be hours late on busy days:
 *  - line-ups from 60 minutes before kickoff until they're in (checked at most every 5 min);
 *  - stats and points from 2 hours after kickoff until they're in (at most every 10 min).
 * Each check is claimed atomically in the database, so a busy page costs at most one API
 * request per window. Never throws: a failed check just waits for the next one.
 */

const MIN = 60 * 1000;

interface MatchTimes {
  id: number;
  kickoff_at: string;
  status: string;
  lineups_synced_at: string | null;
  stats_synced_at: string | null;
}

export type FreshenNeed = "lineups" | "stats" | null;

/** What a match needs right now (pure, for tests). */
export function freshenNeed(m: MatchTimes, now: number): FreshenNeed {
  const ko = Date.parse(m.kickoff_at);
  if (["PST", "CANC", "ABD"].includes(m.status)) return null;
  if (!m.lineups_synced_at && now >= ko - 60 * MIN && now <= ko + 3 * HOUR) return "lineups";
  if (!m.stats_synced_at && now >= ko + 2 * HOUR && now <= ko + 48 * HOUR) return "stats";
  return null;
}

async function claim(ctx: SyncContext, matchId: number, kind: "lineups" | "stats") {
  const { data, error } = await ctx.db.rpc("claim_match_check", {
    p_match: matchId,
    p_kind: kind,
    p_every: kind === "lineups" ? "5 minutes" : "10 minutes",
  });
  return !error && data === true;
}

/** Freshens one match (the team picker awaits this so new line-ups show at once). */
export async function freshenMatch(matchId: number) {
  try {
    const ctx = createSyncContext();
    const { data: m } = await ctx.db
      .from("matches")
      .select("id, kickoff_at, status, lineups_synced_at, stats_synced_at")
      .eq("id", matchId)
      .maybeSingle();
    if (!m) return;
    const need = freshenNeed(m as MatchTimes, ctx.now.getTime());
    if (!need || !(await claim(ctx, matchId, need))) return;
    if (need === "lineups") await syncLineups(ctx, { matchId });
    else await syncStats(ctx, { matchId });
  } catch (err) {
    console.error("[freshen]", err instanceof Error ? err.message : err);
  }
}

/** Freshens every match in a window (run after the response on the match list / table). */
export async function freshenRecent() {
  try {
    const ctx = createSyncContext();
    const now = ctx.now.getTime();
    const { data } = await ctx.db
      .from("matches")
      .select("id, kickoff_at, status, lineups_synced_at, stats_synced_at")
      .gte("kickoff_at", new Date(now - 48 * HOUR).toISOString())
      .lte("kickoff_at", new Date(now + HOUR).toISOString());
    for (const m of (data ?? []) as MatchTimes[]) {
      if (freshenNeed(m, now)) await freshenMatch(m.id);
    }
  } catch (err) {
    console.error("[freshen]", err instanceof Error ? err.message : err);
  }
}
