import "server-only";

import { scoreFantasyTeam, type StoredPick } from "../scoring/score-fantasy-team";
import type { PlayerMatchStats, Position } from "../types";
import { check, type SyncContext, type SyncResult } from "./context";

interface StatsRow {
  player_id: number;
  minutes: number;
  goals: number;
  assists: number;
  clean_sheet: boolean;
  saves: number;
  goals_conceded: number;
  yellow_cards: number;
  red_cards: number;
  penalties_missed: number;
  penalties_saved: number;
  own_goals: number;
}

interface TeamRow {
  id: string;
  user_id: string;
  fantasy_team_players: {
    player_id: number;
    is_captain: boolean;
    is_vice_captain: boolean;
    price: number;
    players: { name: string; position: Position; team_api_id: number } | null;
  }[];
}

export const toStats = (r: StatsRow): PlayerMatchStats => ({
  minutes: r.minutes,
  goals: r.goals,
  assists: r.assists,
  cleanSheet: r.clean_sheet,
  saves: r.saves,
  goalsConceded: r.goals_conceded,
  yellowCards: r.yellow_cards,
  redCards: r.red_cards,
  penaltiesMissed: r.penalties_missed,
  penaltiesSaved: r.penalties_saved,
  ownGoals: r.own_goals,
});

/** Recomputes `fantasy_points` for every team in a match from the stored stats. Idempotent. */
export async function recalculatePoints(
  { db, config, now }: SyncContext,
  matchId: number,
): Promise<SyncResult> {
  const match = check(
    await db.from("matches").select("id, opponent_team_id").eq("id", matchId).single(),
    "load match",
  ) as { id: number; opponent_team_id: number };

  const stats = check(
    await db.from("player_match_stats").select("*").eq("match_id", matchId),
    "load stats",
  ) as StatsRow[];
  const statsById = new Map(stats.map((s) => [Number(s.player_id), toStats(s)]));

  const teams = check(
    await db
      .from("fantasy_teams")
      .select(
        "id, user_id, fantasy_team_players(player_id, is_captain, is_vice_captain, price, players(name, position, team_api_id))",
      )
      .eq("match_id", matchId),
    "load teams",
    // supabase-js types embeds as arrays without generated types; many-to-one is an object at runtime.
  ) as unknown as TeamRow[];

  const rows = teams.map((team) => {
    const picks: StoredPick[] = team.fantasy_team_players.map((p) => ({
      playerId: Number(p.player_id),
      name: p.players?.name ?? "Unknown",
      position: p.players?.position ?? "MID",
      teamId: p.players?.team_api_id ?? 0,
      price: Number(p.price),
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    }));
    const result = scoreFantasyTeam(picks, statsById, [config.barcaTeamId, match.opponent_team_id]);
    return {
      user_id: team.user_id,
      match_id: matchId,
      fantasy_team_id: team.id,
      total_points: result.total,
      breakdown: result.breakdown,
      calculated_at: now.toISOString(),
    };
  });

  if (rows.length > 0) {
    check(
      await db.from("fantasy_points").upsert(rows, { onConflict: "user_id,match_id" }),
      "save points",
    );
  }
  check(
    await db.from("matches").update({ points_calculated_at: now.toISOString() }).eq("id", matchId),
    "mark points calculated",
  );

  return { ok: true, message: `Scored ${rows.length} teams.` };
}
