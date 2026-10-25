import "server-only";

import { timingSafeEqual } from "node:crypto";

import { redirect } from "next/navigation";

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
  profile: Profile | null;
}

/** The signed-in user (validated with Supabase Auth) and their profile, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, email: user.email ?? null, profile: (profile as Profile | null) ?? null };
}

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
