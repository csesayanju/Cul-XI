import { NextResponse } from "next/server";

import { isAdminEmail } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Magic-link and Google sign-in landing: exchanges the code for a session, grants admin to ADMIN_EMAILS,
 * then sends new users to /join and members to /matches.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // OAuth providers send ?error=... when the user cancels or something fails.
  if (url.searchParams.get("error"))
    return NextResponse.redirect(new URL("/?error=oauth", url.origin));
  if (!code) return NextResponse.redirect(new URL("/?error=missing-code", url.origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/?error=link-expired", url.origin));
  }

  const user = data.user;
  if (isAdminEmail(user.email)) {
    await createAdminClient().from("profiles").update({ is_admin: true }).eq("id", user.id);
  }

  const { count } = await supabase
    .from("league_members")
    .select("league_id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return NextResponse.redirect(new URL(count ? "/matches" : "/join", url.origin));
}
