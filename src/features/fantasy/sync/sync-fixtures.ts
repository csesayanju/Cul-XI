import "server-only";

import { mapFixtures } from "@/lib/api-football/mappers";

import { check, HOUR, type SyncContext, type SyncResult } from "./context";

/**
 * Fetches Barça's fixtures for the season (ONE request covers every competition), upserts
 * them, and marks fantasy teams locked for matches that have kicked off.
 * Cached for 12 hours, so calling this more often costs nothing.
 */
export async function syncFixtures(ctx: SyncContext, { force = false } = {}): Promise<SyncResult> {
  const { db, api, config, now } = ctx;
  const { data, fromCache } = await api.teamFixtures(config.barcaTeamId, config.season, {
    maxAgeMs: 12 * HOUR,
    force,
    shouldCache: (d) => d.length > 0,
  });
  const rows = mapFixtures(data, config);

  if (rows.length > 0) {
    check(
      await db.from("matches").upsert(rows, { onConflict: "api_fixture_id" }),
      "upsert matches",
    );
  }
  const locked = await lockStartedTeams(ctx);

  return {
    ok: true,
    message: `Synced ${rows.length} fixtures${fromCache ? " (from cache)" : ""}; locked ${locked} teams.`,
    details: { fixtures: rows.length, fromCache, lockedTeams: locked, at: now.toISOString() },
  };
}

/** Sets `locked` on teams whose match has kicked off (RLS already blocks edits; this records it). */
export async function lockStartedTeams({ db, now }: SyncContext): Promise<number> {
  const started = check(
    await db.from("matches").select("id, kickoff_at").lte("kickoff_at", now.toISOString()),
    "load started matches",
  ) as { id: number; kickoff_at: string }[];
  if (started.length === 0) return 0;

  const locked = check(
    await db
      .from("fantasy_teams")
      .update({ locked: true, locked_at: now.toISOString() })
      .eq("locked", false)
      .in(
        "match_id",
        started.map((m) => m.id),
      )
      .select("id"),
    "lock teams",
  ) as { id: string }[];
  return locked.length;
}
