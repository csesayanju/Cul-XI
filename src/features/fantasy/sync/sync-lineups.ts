import "server-only";

import { hasLineups, mapLineups, toPlayerRow } from "@/lib/highlightly/mappers";

import {
  check,
  HOUR,
  MATCH_COLUMNS,
  type MatchRecord,
  type SyncContext,
  type SyncResult,
} from "./context";
import { upsertPlayers } from "./players";

/**
 * Fetches confirmed line-ups for matches kicking off within `windowHours` (default 1.5h).
 * Highlightly publishes line-ups from ~40 minutes before kickoff; an empty response is not
 * cached, so calling again later is fine. Each match costs one request once line-ups exist.
 */
export async function syncLineups(
  ctx: SyncContext,
  { matchId, windowHours = 1.5 }: { matchId?: number; windowHours?: number } = {},
): Promise<SyncResult> {
  const { db, api, now } = ctx;

  let query = db.from("matches").select(MATCH_COLUMNS);
  query = matchId
    ? query.eq("id", matchId)
    : query
        .is("lineups_synced_at", null)
        .gt("kickoff_at", new Date(now.getTime() - 3 * HOUR).toISOString())
        .lte("kickoff_at", new Date(now.getTime() + windowHours * HOUR).toISOString());
  const matches = check(await query, "load matches") as MatchRecord[];
  if (matches.length === 0) return { ok: true, message: "No matches in the line-up window." };

  const results: string[] = [];
  for (const match of matches) {
    const { data } = await api.lineups(match.api_fixture_id, { shouldCache: hasLineups });
    if (!hasLineups(data)) {
      results.push(`${match.opponent_name}: not announced yet`);
      continue;
    }

    const entries = mapLineups(data);
    // Make sure late call-ups exist as players (position falls back to MID if unknown).
    const ids = await upsertPlayers(ctx, entries.map(toPlayerRow));

    // Everyone not named in the matchday squad is marked not_in_squad, then listed players updated.
    check(
      await db
        .from("match_players")
        .update({ lineup_status: "not_in_squad" })
        .eq("match_id", match.id),
      "reset lineup status",
    );
    check(
      await db.from("match_players").upsert(
        entries.map((e) => ({
          match_id: match.id,
          player_id: ids.get(e.api_player_id)!,
          team_api_id: e.team_api_id,
          lineup_status: e.lineup_status,
        })),
        { onConflict: "match_id,player_id" },
      ),
      "update lineup status",
    );
    check(
      await db.from("matches").update({ lineups_synced_at: now.toISOString() }).eq("id", match.id),
      "mark lineups synced",
    );
    results.push(
      `${match.opponent_name}: ${entries.filter((e) => e.lineup_status === "starting").length} starters`,
    );
  }

  return { ok: true, message: `Line-ups: ${results.join("; ")}.` };
}
