import "server-only";

import { mapSquad } from "@/lib/api-football/mappers";

import {
  check,
  DAY,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";

/**
 * Loads squads for upcoming matches (next `days` days) that have not been synced yet:
 * Barça's squad (cached 7 days, shared by every match) + each opponent's squad.
 */
export async function syncSquads(
  ctx: SyncContext,
  { matchId, days = 10 }: { matchId?: number; days?: number } = {},
): Promise<SyncResult> {
  const { db, api, config, now } = ctx;

  let query = db.from("matches").select(MATCH_COLUMNS);
  query = matchId
    ? query.eq("id", matchId)
    : query
        .is("squads_synced_at", null)
        .gt("kickoff_at", now.toISOString())
        .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString());
  const matches = check(await query.order("kickoff_at"), "load matches") as MatchRecord[];

  if (matches.length === 0) return { ok: true, message: "No matches need squads." };

  const synced: string[] = [];
  for (const match of matches) {
    const [barca, opponent] = await Promise.all([
      api.squad(config.barcaTeamId, { maxAgeMs: 7 * DAY, shouldCache: (d) => d.length > 0 }),
      api.squad(match.opponent_team_id, { maxAgeMs: 7 * DAY, shouldCache: (d) => d.length > 0 }),
    ]);
    const rows = mapSquad([...barca.data, ...opponent.data]);
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
    synced.push(`${match.opponent_name} (${rows.length} players)`);
  }

  return { ok: true, message: `Squads synced: ${synced.join(", ")}.` };
}
