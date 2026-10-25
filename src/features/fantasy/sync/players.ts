import "server-only";

import { toPlayerRow, type PlayerRow } from "@/lib/highlightly/mappers";

import { defaultPrice } from "../pricing";
import { check, type SyncContext } from "./context";

/**
 * Upserts players by API id and returns a map of api_player_id -> players.id.
 * New players get a default price; existing prices (possibly edited by the admin) are kept.
 */
export async function upsertPlayers(
  { db, config }: SyncContext,
  rows: PlayerRow[],
): Promise<Map<number, number>> {
  if (rows.length === 0) return new Map();
  const unique = [...new Map(rows.map((r) => [r.api_player_id, r])).values()];

  const existing = check(
    await db
      .from("players")
      .select("api_player_id, price")
      .in(
        "api_player_id",
        unique.map((r) => r.api_player_id),
      ),
    "load players",
  ) as { api_player_id: number; price: number }[];
  const prices = new Map(existing.map((p) => [p.api_player_id, Number(p.price)]));

  const upserted = check(
    await db
      .from("players")
      .upsert(
        // Only `players` columns: callers may pass richer objects (e.g. line-up entries).
        unique.map((r) => ({
          ...toPlayerRow(r),
          price:
            prices.get(r.api_player_id) ??
            defaultPrice(r.position, r.team_api_id === config.barcaTeamId),
        })),
        { onConflict: "api_player_id" },
      )
      .select("id, api_player_id"),
    "upsert players",
  ) as { id: number; api_player_id: number }[];

  return new Map(upserted.map((p) => [p.api_player_id, p.id]));
}
