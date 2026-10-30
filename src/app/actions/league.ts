"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { FormState } from "./auth";

const codeSchema = z.string().trim().min(1, "Enter the invite code.").max(100);
const nameSchema = z
  .string()
  .trim()
  .min(2, "Use at least 2 characters.")
  .max(40, "Keep it under 40 characters.");

/** Makes sure the default league for INVITE_CODE exists (first join creates it). */
async function ensureDefaultLeague(code: string) {
  const db = createAdminClient();
  // Escape LIKE wildcards so the code matches literally (case-insensitively).
  const pattern = code.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await db
    .from("leagues")
    .select("id")
    .ilike("invite_code", pattern)
    .maybeSingle();
  if (!data) {
    await db.from("leagues").insert({ name: "Culé XI", invite_code: code });
  }
}

/** Joins a private league with its invite code (everyone is already in Global). */
export async function joinLeague(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/?signin=1");

  const parsed = codeSchema.safeParse(formData.get("code"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const code = parsed.data;

  if (code.toLowerCase() === serverEnv().INVITE_CODE.toLowerCase()) {
    await ensureDefaultLeague(serverEnv().INVITE_CODE);
  }

  const supabase = await createClient();
  const { data: leagueId, error } = await supabase.rpc("join_league", { p_code: code });
  if (error) {
    return {
      ok: false,
      message: /invalid invite code/i.test(error.message)
        ? "That invite code doesn't match any league."
        : `Could not join: ${error.message}`,
    };
  }
  revalidatePath("/", "layout");
  redirect(`/leaderboard?league=${leagueId}`);
}

/** Changes the user's name. Names are unique (case-insensitive), enforced by the database. */
export async function updateDisplayName(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/?signin=1");

  const parsed = nameSchema.safeParse(formData.get("displayName"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", user.id);
  if (error) {
    return {
      ok: false,
      message:
        error.code === "23505"
          ? "Someone already has that name. Try another."
          : `Could not save: ${error.message}`,
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `You're now ${parsed.data}.` };
}

/** Leaves a private league (the Global league can't be left). */
export async function leaveLeague(leagueId: string): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in first." };
  if (!z.uuid().safeParse(leagueId).success) return { ok: false, message: "Unknown league." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_league", { p_league: leagueId });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/", "layout");
  return { ok: true, message: "You left the league." };
}
