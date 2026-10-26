import "server-only";

import { findPlayerPhoto } from "@/lib/wikipedia/player-photo";

import { check, DAY, type SyncContext, type SyncResult } from "./context";

/** Max players looked up per run (2 Wikimedia requests each). */
const BATCH = 40;
/** Players with no photo found are re-checked after this long (new photos get uploaded). */
const RECHECK_AFTER = 30 * DAY;

interface PhotoCandidate {
  id: number;
  name: string;
  full_name: string | null;
  team_name: string;
}

/**
 * Finds Wikimedia Commons photos for players in upcoming matches' pools that don't have one
 * yet. Doesn't touch the Highlightly quota. Admin-set/removed photos (photo_locked) are
 * left alone; misses are recorded so they're only retried monthly.
 */
export async function syncPhotos(
  ctx: SyncContext,
  { matchId, days = 10 }: { matchId?: number; days?: number } = {},
): Promise<SyncResult> {
  const { db, now } = ctx;

  let matchQuery = db.from("matches").select("id");
  matchQuery = matchId
    ? matchQuery.eq("id", matchId)
    : matchQuery
        .gt("kickoff_at", now.toISOString())
        .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString());
  const matches = check(await matchQuery, "load matches") as { id: number }[];
  if (matches.length === 0) return { ok: true, message: "No upcoming matches in range." };

  const pool = check(
    await db
      .from("match_players")
      .select("player_id")
      .in(
        "match_id",
        matches.map((m) => m.id),
      ),
    "load match players",
  ) as { player_id: number }[];
  const ids = [...new Set(pool.map((p) => Number(p.player_id)))];
  if (ids.length === 0) return { ok: true, message: "No players to look up." };

  const recheckBefore = new Date(now.getTime() - RECHECK_AFTER).toISOString();
  const candidates = check(
    await db
      .from("players")
      .select("id, name, full_name, team_name")
      .in("id", ids)
      .is("photo_url", null)
      .eq("photo_locked", false)
      .or(`photo_checked_at.is.null,photo_checked_at.lt.${recheckBefore}`)
      .limit(BATCH),
    "load players without photos",
  ) as PhotoCandidate[];

  let found = 0;
  let missing = 0;
  let failed = 0;
  for (const p of candidates) {
    try {
      const photo = await findPlayerPhoto({
        name: p.name,
        fullName: p.full_name,
        teamName: p.team_name,
      });
      check(
        await db
          .from("players")
          .update({
            photo_url: photo?.url ?? null,
            photo_credit: photo?.credit ?? null,
            photo_page_url: photo?.pageUrl ?? null,
            photo_checked_at: now.toISOString(),
          })
          .eq("id", p.id),
        "save photo",
      );
      if (photo) found++;
      else missing++;
    } catch {
      failed++; // not recorded as checked, so it's retried on the next run
    }
  }

  return {
    ok: true,
    message: `Photos: checked ${candidates.length}, found ${found}, none for ${missing}${failed ? `, ${failed} failed (will retry)` : ""}.`,
  };
}
