import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SyncResult } from "@/features/fantasy/sync/context";

import { selectStaleGuests, type GuestUser } from "./stale-guests";

/** Guests older than this who never joined a league or saved a team are deleted. */
export const GUEST_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const PAGE_SIZE = 1000;

/**
 * Deletes unused guest (anonymous) accounts. Their profile rows are removed by the
 * `on delete cascade` foreign key. Uses the service-role client (auth admin API).
 */
export async function cleanupGuests(db: SupabaseClient, now = new Date()): Promise<SyncResult> {
  const users: GuestUser[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`list users: ${error.message}`);
    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        isAnonymous: u.is_anonymous === true,
        createdAt: u.created_at,
      })),
    );
    if (data.users.length < PAGE_SIZE) break;
  }

  const guests = users.filter((u) => u.isAnonymous);
  if (guests.length === 0) return { ok: true, message: "No guest accounts." };

  const guestIds = guests.map((g) => g.id);
  const [members, teams] = await Promise.all([
    db.from("league_members").select("user_id").in("user_id", guestIds),
    db.from("fantasy_teams").select("user_id").in("user_id", guestIds),
  ]);
  if (members.error) throw new Error(`load members: ${members.error.message}`);
  if (teams.error) throw new Error(`load teams: ${teams.error.message}`);
  const active = new Set([...members.data, ...teams.data].map((r) => r.user_id as string));

  const stale = selectStaleGuests(guests, active, now, GUEST_MAX_AGE_MS);
  let deleted = 0;
  for (const id of stale) {
    const { error } = await db.auth.admin.deleteUser(id);
    if (!error) deleted++;
  }

  return {
    ok: true,
    message: `Guests: ${guests.length} total, ${active.size} active, deleted ${deleted} unused${
      deleted < stale.length ? ` (${stale.length - deleted} failed)` : ""
    }.`,
  };
}
