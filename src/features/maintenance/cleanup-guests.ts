import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SyncResult } from "@/features/fantasy/sync/context";

import { selectStaleGuests, type GuestUser } from "./stale-guests";

/** Guests are deleted after this long without using the app. */
export const GUEST_MAX_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

const PAGE_SIZE = 1000;

/**
 * Deletes guest (anonymous) accounts nobody has used for 7 days. "Used" = last seen by the
 * app (profiles.last_seen_at, refreshed while signed in). Their data goes with them via
 * `on delete cascade`. Uses the service-role client (auth admin API).
 */
export async function cleanupGuests(db: SupabaseClient, now = new Date()): Promise<SyncResult> {
  const guests: GuestUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`list users: ${error.message}`);
    for (const u of data.users) {
      if (u.is_anonymous === true) {
        guests.push({ id: u.id, isAnonymous: true, createdAt: u.created_at, lastSeenAt: null });
      }
    }
    if (data.users.length < PAGE_SIZE) break;
  }
  if (guests.length === 0) return { ok: true, message: "No guest accounts." };

  // Last seen, in chunks (keeps the request URL short).
  const seen = new Map<string, string>();
  for (let i = 0; i < guests.length; i += 200) {
    const { data, error } = await db
      .from("profiles")
      .select("id, last_seen_at")
      .in(
        "id",
        guests.slice(i, i + 200).map((g) => g.id),
      );
    if (error) throw new Error(`load last seen: ${error.message}`);
    for (const r of data) seen.set(r.id as string, r.last_seen_at as string);
  }
  for (const g of guests) g.lastSeenAt = seen.get(g.id) ?? null;

  const stale = selectStaleGuests(guests, now, GUEST_MAX_IDLE_MS);
  let deleted = 0;
  for (const id of stale) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (!error) deleted++;
  }

  return {
    ok: true,
    message: `Guests: ${guests.length} total, deleted ${deleted} not seen for 7 days${
      deleted < stale.length ? ` (${stale.length - deleted} failed)` : ""
    }.`,
  };
}
