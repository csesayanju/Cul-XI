import "server-only";

import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
  last_seen_at: string;
}

/** How often "last seen" is refreshed (guests are cleaned up after 7 days away). */
const SEEN_EVERY_MS = 12 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string | null;
  /** Guest account created with "Play as a guest" (no email; tied to this browser). */
  isAnonymous: boolean;
  profile: Profile | null;
}

/**
 * The signed-in user and their profile, or null.
 *
 * Performance: the session JWT is verified locally with `getClaims()` (the project uses
 * asymmetric ES256 signing keys, so no round trip to Supabase Auth), and the result is
 * memoised per request with React `cache`, so the layout, page and actions of one request
 * share a single verification + profile query.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_admin, last_seen_at")
    .eq("id", claims.sub)
    .maybeSingle();

  // Keep "last seen" fresh (at most twice a day), after the response so it never slows a page.
  const seen = Date.parse((profile as Profile | null)?.last_seen_at ?? "");
  if (profile && !(Date.now() - seen < SEEN_EVERY_MS)) {
    after(async () => {
      await supabase.rpc("touch_last_seen");
    });
  }

  return {
    id: claims.sub,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    isAnonymous: claims.is_anonymous === true,
    profile: (profile as Profile | null) ?? null,
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/?signin=1");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.profile?.is_admin) redirect("/matches");
  return user;
}

/** Constant-time check of an `Authorization: Bearer <CRON_SECRET>` header. */
export function hasCronSecret(authorization: string | null): boolean {
  const expected = Buffer.from(`Bearer ${serverEnv().CRON_SECRET}`);
  const actual = Buffer.from(authorization ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True for Vercel Cron / scripts holding CRON_SECRET, or a signed-in admin. */
export async function isCronOrAdmin(request: Request): Promise<boolean> {
  if (hasCronSecret(request.headers.get("authorization"))) return true;
  const user = await getSessionUser();
  return !!user?.profile?.is_admin;
}
