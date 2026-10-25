import "server-only";

import { isFinished, mapFixturePlayerStats, mapFixtures } from "@/lib/api-football/mappers";

import {
  check,
  HOUR,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";
import { recalculatePoints } from "./recalculate-points";

/**
 * After full time: refresh the fixture's final status/score (1 request, skipped if already
 * finished in our DB), fetch per-player stats ONCE (1 request, cached forever), store them
 * — never overwriting rows an admin entered manually — and recalculate points.
 */
export async function syncStats(
  ctx: SyncContext,
  { matchId }: { matchId?: number } = {},
): Promise<SyncResult> {
  const { db, api, config, now } = ctx;

  let query = db.from("matches").select(MATCH_COLUMNS);
  query = matchId
    ? query.eq("id", matchId)
    : query
        .is("stats_synced_at", null)
        // Give the API ~2.5h after kickoff to finish and settle stats.
        .lte("kickoff_at", new Date(now.getTime() - 2.5 * HOUR).toISOString())
        .not("status", "in", "(PST,CANC,ABD)");
  const matches = check(await query.order("kickoff_at"), "load matches") as MatchRecord[];
  if (matches.length === 0) return { ok: true, message: "No finished matches waiting for stats." };

  const results: string[] = [];
  for (let match of matches) {
    if (!isFinished(match.status) || match.barca_goals == null) {
      const { data } = await api.fixture(match.api_fixture_id, {
        maxAgeMs: HOUR,
        shouldCache: (d) => d.length > 0 && isFinished(d[0]!.fixture.status.short),
      });
      const [row] = mapFixtures(data, config);
      if (row) {
        check(await db.from("matches").update(row).eq("id", match.id), "update match");
        match = { ...match, ...row };
      }
    }
    if (!isFinished(match.status)) {
      results.push(`${match.opponent_name}: not finished (status ${match.status})`);
      continue;
    }

    const { data } = await api.fixturePlayers(match.api_fixture_id, {
      shouldCache: (d) => d.length > 0,
    });
    if (data.length === 0) {
      results.push(`${match.opponent_name}: stats not available yet`);
      continue;
    }

    const entries = mapFixturePlayerStats(data, {
      barcaTeamId: config.barcaTeamId,
      barcaGoals: match.barca_goals ?? 0,
      opponentGoals: match.opponent_goals ?? 0,
    });

    // Players we don't know yet (rare) are added; position comes from the squad sync normally.
    const known = check(
      await db
        .from("players")
        .select("id, api_player_id")
        .in(
          "api_player_id",
          entries.map((e) => e.api_player_id),
        ),
      "load players",
    ) as { id: number; api_player_id: number }[];
    const ids = new Map(known.map((p) => [p.api_player_id, p.id]));
    const unknown = entries.filter((e) => !ids.has(e.api_player_id));
    if (unknown.length > 0) {
      const added = await upsertPlayers(
        ctx,
        unknown.map((e) => ({
          api_player_id: e.api_player_id,
          name: e.name,
          team_api_id: e.team_api_id,
          team_name: e.team_api_id === config.barcaTeamId ? "Barcelona" : match.opponent_name,
          position: "MID",
          shirt_number: null,
        })),
      );
      for (const [k, v] of added) ids.set(k, v);
    }

    const manual = check(
      await db
        .from("player_match_stats")
        .select("player_id")
        .eq("match_id", match.id)
        .eq("source", "manual"),
      "load manual stats",
    ) as { player_id: number }[];
    const manualIds = new Set(manual.map((m) => m.player_id));

    const rows = entries
      .map((e) => ({ ...e, player_id: ids.get(e.api_player_id)! }))
      .filter((e) => !manualIds.has(e.player_id))
      .map(({ player_id, stats: s }) => ({
        match_id: match.id,
        player_id,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        clean_sheet: s.cleanSheet,
        saves: s.saves,
        goals_conceded: s.goalsConceded,
        yellow_cards: s.yellowCards,
        red_cards: s.redCards,
        penalties_missed: s.penaltiesMissed,
        penalties_saved: s.penaltiesSaved,
        own_goals: s.ownGoals,
        source: "api" as const,
      }));
    if (rows.length > 0) {
      check(
        await db.from("player_match_stats").upsert(rows, { onConflict: "match_id,player_id" }),
        "upsert stats",
      );
    }
    check(
      await db.from("matches").update({ stats_synced_at: now.toISOString() }).eq("id", match.id),
      "mark stats synced",
    );

    const points = await recalculatePoints(ctx, match.id);
    results.push(
      `${match.opponent_name}: ${rows.length} stat lines (${manualIds.size} manual kept); ${points.message}`,
    );
  }

  return { ok: true, message: results.join(" ") };
}
