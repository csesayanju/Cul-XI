import "server-only";

import { toPlayerRow, type PlayerRow } from "@/lib/highlightly/mappers";

import { EMPTY_FORM, priceFor, type PlayerForm } from "../pricing";
import { check, type SyncContext } from "./context";

interface ExistingPlayer {
  api_player_id: number;
  price: number;
  price_locked: boolean;
  photo_url: string | null;
  full_name: string | null;
  market_value: number | null;
  form: PlayerForm | Record<string, never>;
}

const hasForm = (f: ExistingPlayer["form"] | undefined): f is PlayerForm =>
  !!f && typeof (f as PlayerForm).matches === "number";

/**
 * Upserts players by API id and returns a map of api_player_id -> players.id.
 *
 * Prices come from recent form + market value (see pricing.ts) and are refreshed on every sync, except for
 * players whose price an admin locked. A stored photo or form is kept when a row doesn't
 * bring a new one (e.g. a line-up entry), so partial rows never wipe data.
 */
export async function upsertPlayers(
  { db }: SyncContext,
  rows: PlayerRow[],
): Promise<Map<number, number>> {
  if (rows.length === 0) return new Map();
  const unique = [...new Map(rows.map((r) => [r.api_player_id, r])).values()];

  const existing = check(
    await db
      .from("players")
      .select("api_player_id, price, price_locked, photo_url, full_name, market_value, form")
      .in(
        "api_player_id",
        unique.map((r) => r.api_player_id),
      ),
    "load players",
  ) as ExistingPlayer[];
  const byId = new Map(existing.map((p) => [Number(p.api_player_id), p]));

  const payload = unique.map((r) => {
    const row = toPlayerRow(r);
    const old = byId.get(r.api_player_id);
    const form = row.form ?? (hasForm(old?.form) ? old.form : { ...EMPTY_FORM });
    return {
      api_player_id: row.api_player_id,
      name: row.name,
      team_api_id: row.team_api_id,
      team_name: row.team_name,
      position: row.position,
      shirt_number: row.shirt_number,
      // Same keys on every object: PostgREST upserts the union of columns.
      photo_url: row.photo_url ?? old?.photo_url ?? null,
      full_name: row.full_name ?? old?.full_name ?? null,
      form,
      price: old?.price_locked
        ? Number(old.price)
        : priceFor(row.position, form, old?.market_value == null ? null : Number(old.market_value)),
    };
  });

  const upserted = check(
    await db
      .from("players")
      .upsert(payload, { onConflict: "api_player_id" })
      .select("id, api_player_id"),
    "upsert players",
  ) as { id: number; api_player_id: number }[];

  return new Map(upserted.map((p) => [Number(p.api_player_id), Number(p.id)]));
}
