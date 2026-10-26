import "server-only";

import { ProviderError } from "@/lib/highlightly/client";
import { latestMarketValue } from "@/lib/highlightly/mappers";

import { EMPTY_FORM, priceFor, type PlayerForm } from "../pricing";
import type { Position } from "../types";
import { check, DAY, type SyncContext, type SyncResult } from "./context";

/** Max Highlightly requests per run (1 per player). */
const MAX_REQUESTS = 25;
/** Never take the daily quota below this, so match-day syncs always have room. */
const QUOTA_RESERVE = 30;
/** Market values change slowly: refresh monthly. */
const REFRESH_AFTER = 30 * DAY;

interface Candidate {
  id: number;
  api_player_id: number;
  team_api_id: number;
  position: Position;
  form: Partial<PlayerForm> | null;
  price_locked: boolean;
}

/**
 * Fetches market values (player "status" for pricing) for players in upcoming matches'
 * pools, Barça first, then re-prices them. Budgeted: at most MAX_REQUESTS per run and never
 * below QUOTA_RESERVE remaining, so it can't starve line-up or stats syncs.
 */
export async function syncValues(
  ctx: SyncContext,
  { days = 10 }: { days?: number } = {},
): Promise<SyncResult> {
  const { db, api, config, now } = ctx;

  const matches = check(
    await db
      .from("matches")
      .select("id")
      .gt("kickoff_at", now.toISOString())
      .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString()),
    "load matches",
  ) as { id: number }[];
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
  if (ids.length === 0) return { ok: true, message: "No players to value." };

  const staleBefore = new Date(now.getTime() - REFRESH_AFTER).toISOString();
  const candidates = (
    check(
      await db
        .from("players")
        .select("id, api_player_id, team_api_id, position, form, price_locked")
        .in("id", ids)
        .or(`market_value_checked_at.is.null,market_value_checked_at.lt.${staleBefore}`),
      "load players to value",
    ) as Candidate[]
  )
    // Barça first, then regular starters before fringe players.
    .sort(
      (a, b) =>
        Number(Number(b.team_api_id) === config.barcaTeamId) -
          Number(Number(a.team_api_id) === config.barcaTeamId) ||
        (b.form?.starts ?? 0) - (a.form?.starts ?? 0),
    );

  let fetched = 0;
  let processed = 0;
  let valued = 0;
  let stoppedFor: string | null = null;
  for (const p of candidates) {
    if (fetched >= MAX_REQUESTS) {
      stoppedFor = "per-run limit";
      break;
    }
    const remaining = api.getQuota().dailyRemaining;
    if (remaining != null && remaining <= QUOTA_RESERVE) {
      stoppedFor = `quota reserve (${remaining} left)`;
      break;
    }
    try {
      const { data, fromCache } = await api.player(Number(p.api_player_id), {
        maxAgeMs: REFRESH_AFTER,
        shouldCache: (d) => d.length > 0,
      });
      if (!fromCache) fetched++;
      const value = latestMarketValue(data[0]?.marketValue);
      const form = { ...EMPTY_FORM, ...(p.form ?? {}) } as PlayerForm;
      check(
        await db
          .from("players")
          .update({
            market_value: value,
            market_value_checked_at: now.toISOString(),
            ...(p.price_locked ? {} : { price: priceFor(p.position, form, value) }),
          })
          .eq("id", p.id),
        "save market value",
      );
      processed++;
      if (value != null) valued++;
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "quota" || err.kind === "rate_limit")) {
        stoppedFor = err.kind;
        break;
      }
      throw err;
    }
  }

  const left = candidates.length - processed;
  return {
    ok: true,
    message:
      `Market values: ${valued} found, ${fetched} requests used` +
      (stoppedFor ? `; paused (${stoppedFor}), ${left} left for the next run.` : "."),
  };
}
