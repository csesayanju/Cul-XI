import "server-only";

import {
  hasLineups,
  playerPoolFromLineups,
  recentFinished,
  type PlayerRow,
} from "@/lib/highlightly/mappers";
import type { HlLineups } from "@/lib/highlightly/types";

import {
  check,
  DAY,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";

/** How many recent matches' line-ups make up a team's player pool. */
const POOL_MATCHES = 2;

/**
 * Builds a team's player pool from the line-ups (starters + bench) of its last
 * `POOL_MATCHES` finished games. Cost: 1 request (last five games, cached 1 day) + up to
 * `POOL_MATCHES` line-up requests (cached forever). Highlightly has no squad endpoint.
 */
async function teamPool({ api }: SyncContext, teamId: number): Promise<PlayerRow[]> {
  const { data: lastFive } = await api.lastFiveGames(teamId, {
    maxAgeMs: DAY,
    shouldCache: (d) => d.length > 0,
  });
  const lineups: HlLineups[] = [];
  for (const m of recentFinished(lastFive, POOL_MATCHES)) {
    const { data } = await api.lineups(m.id, { shouldCache: hasLineups });
    if (hasLineups(data)) lineups.push(data);
  }
  return playerPoolFromLineups(lineups, teamId);
}

/**
 * Loads player pools for upcoming matches (next `days` days) that have not been synced
 * yet: Barça (shared by every match in the run) + each opponent.
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
        .is("squads_synced_at", null)
        .gt("kickoff_at", now.toISOString())
        .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString());
  const matches = check(await query.order("kickoff_at"), "load matches") as MatchRecord[];

  if (matches.length === 0) return { ok: true, message: "No matches need squads." };

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

  return { ok: true, message: `Squads: ${synced.join("; ")}.` };
}
