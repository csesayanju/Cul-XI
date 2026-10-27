import "server-only";

import { publicEnv } from "@/lib/env/public";

export interface AuthMethods {
  google: boolean;
  guest: boolean;
}

/** Never let this lookup hold up the sign-in page for longer than this. */
const TIMEOUT_MS = 1000;
/** Re-check the settings at most this often per server instance. */
const MEMO_MS = 5 * 60 * 1000;

let memo: { at: number; value: AuthMethods } | null = null;

/**
 * Which sign-in methods are switched on in the Supabase dashboard, read from the public
 * `/auth/v1/settings` endpoint. Buttons for disabled methods are hidden, so users never hit a
 * "provider is not enabled" error page.
 *
 * Performance: memoised per server instance for 5 minutes, and capped at 1 second — on a slow
 * or failed lookup the last known answer is used (email sign-in always works regardless).
 */
export async function getAuthMethods(): Promise<AuthMethods> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
  try {
    const env = publicEnv();
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    const value = {
      google: settings.external?.google === true,
      guest: settings.external?.anonymous_users === true,
    };
    memo = { at: Date.now(), value };
    return value;
  } catch {
    return memo?.value ?? { google: false, guest: false };
  }
}
