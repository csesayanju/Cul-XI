import "server-only";

import { isFinished, mapBoxScore, mapMatchDetail, statusCode } from "@/lib/highlightly/mappers";

import {
  check,
  DAY,
  HOUR,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";
import { applyPriceCap } from "./price-cap";
import { recalculatePoints } from "./recalculate-points";

/** Match states during which live points are updated. */
const IN_PLAY = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"];
/** Live updates stop when fewer daily requests than this remain (kept for full time). */
export const LIVE_QUOTA_RESERVE = 12;

/**
 * After full time: fetch the match details (final state, score and events — 1 request, cached
 * forever once finished) and the player box score (1 request, cached forever), store the stats
 * — never overwriting rows an admin entered manually — and recalculate points.
 *
 * `live`: during the match, the same with in-play data — never cached, points marked
 * provisional (`points_live`), and skipped when the daily quota runs low. The full-time run
 * replaces them with final points.
 */
export async function syncStats(
  ctx: SyncContext,
  { matchId, live = false }: { matchId?: number; live?: boolean } = {},
): Promise<SyncResult> {
  const { db, api, config, now } = ctx;

  let query = db.from("matches").select(MATCH_COLUMNS);
  query = matchId
    ? query.eq("id", matchId)
    : query
        .is("stats_synced_at", null)
        // Give the API ~2.5h after kickoff to finish and settle stats…
        .lte("kickoff_at", new Date(now.getTime() - 2.5 * HOUR).toISOString())
        // …but don't backfill older matches automatically (admins can pass matchId).
        .gte("kickoff_at", new Date(now.getTime() - 3 * DAY).toISOString())
        .not("status", "in", "(PST,CANC,ABD)");
  const matches = check(await query.order("kickoff_at"), "load matches") as MatchRecord[];
  if (matches.length === 0) return { ok: true, message: "No finished matches waiting for stats." };

  const results: string[] = [];
  for (let match of matches) {
    const { data: details } = await api.match(match.api_fixture_id, {
      maxAgeMs: live ? 0 : HOUR,
      shouldCache: (d) => !!d[0] && isFinished(statusCode(d[0].state.description)),
    });
    const detail = details[0];
    if (detail) {
      const row = mapMatchDetail(detail, config.barcaTeamId);
      check(await db.from("matches").update(row).eq("id", match.id), "update match");
      match = { ...match, ...row };
    }
    const finished = isFinished(match.status);
    if (!finished && !(live && IN_PLAY.includes(match.status))) {
      results.push(`${match.opponent_name}: not finished (status ${match.status})`);
      continue;
    }
    const quota = api.getQuota().dailyRemaining;
    if (!finished && quota != null && quota < LIVE_QUOTA_RESERVE) {
      results.push(`${match.opponent_name}: live update skipped (${quota} requests left today)`);
      continue;
    }

    // In-play box scores change every minute: never cache them (full time fetches afresh).
    const { data } = await api.boxScore(
      match.api_fixture_id,
      finished
        ? { shouldCache: (d) => d.some((t) => t.players.length > 0) }
        : { force: true, shouldCache: () => false },
    );
    if (!data.some((t) => t.players.length > 0)) {
      results.push(`${match.opponent_name}: stats not available yet`);
      continue;
    }

    const entries = mapBoxScore(data, {
      barcaTeamId: config.barcaTeamId,
      barcaGoals: match.barca_goals ?? 0,
      opponentGoals: match.opponent_goals ?? 0,
      events: detail?.events,
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
          position: e.position ?? "MID",
          shirt_number: null,
          photo_url: e.photoUrl,
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
      await db
        .from("matches")
        .update(
          finished
            ? { stats_synced_at: now.toISOString(), points_live: false }
            : { points_live: true },
        )
        .eq("id", match.id),
      "mark stats synced",
    );

    const points = await recalculatePoints(ctx, match.id);
    results.push(
      `${match.opponent_name}: ${rows.length} stat lines (${manualIds.size} manual kept); ${points.message}`,
    );
  }

  // New box scores re-price players (upsertPlayers), so re-apply the cap.
  results.push(await applyPriceCap(db, now));
  return { ok: true, message: results.join(" ") };
}
