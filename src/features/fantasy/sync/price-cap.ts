import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { capDiscount, cappedPrice, type PoolPlayer } from "../price-cap";
import {
  EMPTY_FORM,
  priceFor,
  type FantasyForm,
  type PlayerForm,
  type SeasonStats,
} from "../pricing";
import type { Position } from "../types";
import { check } from "./context";

interface Row {
  match_id: number;
  players: {
    id: number;
    team_api_id: number;
    position: Position;
    price: number;
    price_locked: boolean;
    form: Partial<PlayerForm> | null;
    last_match: PlayerForm | null;
    fantasy_form: FantasyForm | null;
    season_stats: SeasonStats | null;
    market_value: number | null;
  };
}

/**
 * Enforces the price cap on every upcoming match: prices are recomputed from the stored
 * inputs (so re-running never stacks discounts), then each pool gets the smallest equal
 * discount that keeps its priciest XI within `TEAM_RULES.maxTeamCost`. A player in several
 * pools (Barça) takes the largest discount. Run after anything that writes prices.
 */
export async function applyPriceCap(db: SupabaseClient, now = new Date()): Promise<string> {
  const matches = check(
    await db.from("matches").select("id").gt("kickoff_at", now.toISOString()),
    "load upcoming matches",
  ) as { id: number }[];
  if (matches.length === 0) return "Price cap: no upcoming matches.";

  const rows = check(
    await db
      .from("match_players")
      .select(
        "match_id, players(id, team_api_id, position, price, price_locked, form, last_match, fantasy_form, season_stats, market_value)",
      )
      .in(
        "match_id",
        matches.map((m) => m.id),
      ),
    "load pools",
  ) as unknown as Row[];

  const players = new Map<number, PoolPlayer & { stored: number }>();
  const pools = new Map<number, PoolPlayer[]>();
  for (const { match_id, players: p } of rows) {
    if (!players.has(p.id)) {
      players.set(p.id, {
        id: p.id,
        team: Number(p.team_api_id),
        position: p.position,
        locked: p.price_locked,
        stored: Number(p.price),
        price: p.price_locked
          ? Number(p.price)
          : priceFor(p.position, {
              form: { ...EMPTY_FORM, ...(p.form ?? {}) } as PlayerForm,
              last: p.last_match,
              fantasy: p.fantasy_form,
              season: p.season_stats,
              marketValue: p.market_value == null ? null : Number(p.market_value),
            }),
      });
    }
    pools.set(match_id, [...(pools.get(match_id) ?? []), players.get(p.id)!]);
  }

  const discount = new Map<number, number>();
  const notes: string[] = [];
  for (const [matchId, pool] of pools) {
    const by = capDiscount(pool);
    if (by > 0) notes.push(`match ${matchId} −${by}`);
    for (const p of pool) discount.set(p.id, Math.max(discount.get(p.id) ?? 0, by));
  }

  const changed = [...players.values()]
    .map((p) => ({ id: p.id, stored: p.stored, price: cappedPrice(p, discount.get(p.id) ?? 0) }))
    .filter((p) => p.price !== p.stored);
  await Promise.all(
    changed.map(async (p) =>
      check(
        await db.from("players").update({ price: p.price }).eq("id", p.id),
        "save capped price",
      ),
    ),
  );

  return `Price cap: ${notes.length ? notes.join(", ") : "all within limit"} (${changed.length} prices updated).`;
}
