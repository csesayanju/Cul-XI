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

/** Starts Google sign-in. Supabase redirects back to /auth/callback with a code. */
export async function signInWithGoogle(): Promise<FormState> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${serverEnv().APP_URL}/auth/callback` },
  });
  if (error || !data.url) {
    return { ok: false, message: `Google sign-in is unavailable: ${error?.message ?? "no URL"}` };
  }
  redirect(data.url);
}

/**
 * Plays as a guest: creates an anonymous Supabase user (no email). The database gives them a
 * unique football name and a seat in the Global league, so they can play straight away.
 */
export async function signInAsGuest(): Promise<FormState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { ok: false, message: `Guest sign-in is unavailable: ${error.message}` };
  redirect("/matches?welcome=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
