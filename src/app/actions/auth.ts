"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  ok: boolean;
  message: string;
}

const emailSchema = z.email("Enter a valid email address.");

export async function signInWithMagicLink(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${serverEnv().APP_URL}/auth/callback` },
  });
  if (error) return { ok: false, message: `Could not send the link: ${error.message}` };

  return { ok: true, message: "Check your inbox — we sent you a sign-in link." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
