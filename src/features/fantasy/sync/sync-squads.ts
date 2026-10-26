import "server-only";

import {
  hasLineups,
  playerPoolFromLineups,
  recentFinished,
  recentFormFromBoxScores,
  type PlayerRow,
} from "@/lib/highlightly/mappers";
import type { HlBoxScoreTeam, HlLineups } from "@/lib/highlightly/types";

import {
  check,
  DAY,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";

/** How many recent matches make up a team's player pool and form (and so its prices). */
const RECENT_MATCHES = 5;

/**
 * Builds a team's player pool from the line-ups (starters + bench) of its last
 * `RECENT_MATCHES` finished games, with recent form and photos from their box scores.
 * Cost: 1 request (last five games, cached 1 day) + 2 per new finished match (line-ups +
 * box score, cached forever). Highlightly has no squad endpoint.
 */
async function teamPool({ api }: SyncContext, teamId: number): Promise<PlayerRow[]> {
  const { data: lastFive } = await api.lastFiveGames(teamId, {
    maxAgeMs: DAY,
    shouldCache: (d) => d.length > 0,
  });
  const recent = recentFinished(lastFive, RECENT_MATCHES);

  const lineups: HlLineups[] = [];
  const boxScores: HlBoxScoreTeam[][] = [];
  for (const m of recent) {
    const { data: l } = await api.lineups(m.id, { shouldCache: hasLineups });
    if (hasLineups(l)) lineups.push(l);
    const { data: b } = await api.boxScore(m.id, {
      shouldCache: (d) => d.some((t) => t.players.length > 0),
    });
    if (b.some((t) => t.players.length > 0)) boxScores.push(b);
  }

  return playerPoolFromLineups(
    lineups,
    teamId,
    recentFormFromBoxScores(boxScores, teamId),
    boxScores.length,
  );
}

/**
 * Refreshes player pools, form, photos and prices for upcoming matches (next `days` days):
 * Barça (shared by every match in the run) + each opponent. Runs daily, so prices follow
 * form; mostly served from cache. Teams already saved keep the prices they paid.
 */
export async function syncSquads(
  ctx: SyncContext,
  { matchId, days = 10 }: { matchId?: number; days?: number } = {},
): Promise<SyncResult> {
  const { db, config, now } = ctx;

  let query = db.from("matches").select(MATCH_COLUMNS);
  query = matchId
    ? query.eq("id", matchId)
    : query
        .gt("kickoff_at", now.toISOString())
        .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString());
  const matches = check(await query.order("kickoff_at"), "load matches") as MatchRecord[];

  if (matches.length === 0) return { ok: true, message: "No upcoming matches in range." };

  const barca = await teamPool(ctx, config.barcaTeamId);
  const synced: string[] = [];
  for (const match of matches) {
    const opponent = await teamPool(ctx, match.opponent_team_id);
    const rows = [...barca, ...opponent];
    if (rows.length === 0) {
      synced.push(`${match.opponent_name}: no recent line-ups found`);
      continue;
    }
    const ids = await upsertPlayers(ctx, rows);

    check(
      await db.from("match_players").upsert(
        rows.map((r) => ({
          match_id: match.id,
          player_id: ids.get(r.api_player_id)!,
          team_api_id: r.team_api_id,
        })),
        { onConflict: "match_id,player_id", ignoreDuplicates: true },
      ),
      "upsert match players",
    );
    check(
      await db.from("matches").update({ squads_synced_at: now.toISOString() }).eq("id", match.id),
      "mark squads synced",
    );
    synced.push(
      `${match.opponent_name} (${barca.length} Barça + ${opponent.length} opponent players)`,
    );
  }

  return { ok: true, message: `Squads & prices: ${synced.join("; ")}.` };
}
