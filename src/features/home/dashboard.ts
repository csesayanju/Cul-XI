import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getMyLeague, listMatches } from "@/features/fantasy/queries";
import { streak, triviaDay } from "@/features/trivia/game";

/** The daily trivia games (one row per user per day each). */
const DAILY_GAMES = [
  "trivia_attempts",
  "ttt_attempts",
  "mystery_attempts",
  "connections_attempts",
  "lineup_attempts",
  "career_attempts",
] as const;

export interface Dashboard {
  next: {
    id: number;
    title: string;
    kickoffAt: string;
    competition: string;
    hasTeam: boolean;
    live: boolean;
  } | null;
  rank: { position: number; of: number; points: number; league: string } | null;
  trivia: { played: number; total: number; streak: number };
}

/** Everything the home bento shows, in one parallel round (RLS limits rows to the user's). */
export async function loadDashboard(db: SupabaseClient, userId: string): Promise<Dashboard> {
  const day = triviaDay();
  const [{ upcoming }, league, teams, points, played, cule] = await Promise.all([
    listMatches(db),
    getMyLeague(db, userId),
    db.from("fantasy_teams").select("match_id").eq("user_id", userId),
    db.from("fantasy_points").select("user_id, total_points"),
    Promise.all(
      DAILY_GAMES.map((t) =>
        db
          .from(t)
          .select("day", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("day", day),
      ),
    ),
    db
      .from("trivia_attempts")
      .select("day")
      .eq("user_id", userId)
      .eq("finished", true)
      .eq("live", true),
  ]);

  const mine = new Set((teams.data ?? []).map((t) => Number(t.match_id)));
  // "Upcoming" includes matches that kicked off in the last 3 hours: the first one not
  // finished is the match to show (live if it has started).
  const DONE = ["FT", "AET", "PEN", "AWD", "PST", "CANC", "ABD"];
  const m = upcoming.find((x) => !DONE.includes(x.status)) ?? null;
  const next = m
    ? {
        id: m.id,
        title: m.is_home ? `Barça vs ${m.opponent_name}` : `${m.opponent_name} vs Barça`,
        kickoffAt: m.kickoff_at,
        competition: m.competition,
        hasTeam: mine.has(m.id),
        live: Date.parse(m.kickoff_at) <= Date.now(),
      }
    : null;

  // League table position from everyone's points (league-mates only).
  let rank: Dashboard["rank"] = null;
  if (league) {
    const totals = new Map<string, number>([...league.members.keys()].map((id) => [id, 0]));
    for (const p of points.data ?? []) {
      if (totals.has(p.user_id as string)) {
        totals.set(p.user_id as string, totals.get(p.user_id as string)! + Number(p.total_points));
      }
    }
    const sorted = [...totals].sort((a, b) => b[1] - a[1]);
    const mineAt = sorted.findIndex(([id]) => id === userId);
    rank = {
      position: mineAt + 1,
      of: sorted.length,
      points: totals.get(userId) ?? 0,
      league: league.isGlobal ? "Global" : league.name,
    };
  }

  return {
    next,
    rank,
    trivia: {
      played: played.filter((r) => (r.count ?? 0) > 0).length,
      total: DAILY_GAMES.length,
      streak: streak(
        ((cule.data ?? []) as { day: string }[]).map((r) => r.day),
        day,
      ),
    },
  };
}
