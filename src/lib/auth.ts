import "server-only";

import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";
import { cache } from "react";

import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  display_name: string;
  is_admin: boolean;
}

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
    .select("id, display_name, is_admin")
    .eq("id", claims.sub)
    .maybeSingle();

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
