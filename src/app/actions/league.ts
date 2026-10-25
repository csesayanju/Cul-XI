"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser } from "@/lib/auth";
import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { FormState } from "./auth";

const joinSchema = z.object({
  code: z.string().trim().min(1, "Enter the invite code.").max(100),
  displayName: z.string().trim().min(1, "Choose a display name.").max(40),
});

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

export async function joinLeague(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) redirect("/?signin=1");

  const parsed = joinSchema.safeParse({
    code: formData.get("code"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
  const { code, displayName } = parsed.data;

  if (code.toLowerCase() === serverEnv().INVITE_CODE.toLowerCase()) {
    await ensureDefaultLeague(serverEnv().INVITE_CODE);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_league", { p_code: code });
  if (error) {
    return {
      ok: false,
      message: /invalid invite code/i.test(error.message)
        ? "That invite code doesn't match any league."
        : `Could not join: ${error.message}`,
    };
  }

  await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
  redirect("/matches");
}
