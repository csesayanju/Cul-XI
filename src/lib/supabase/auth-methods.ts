import "server-only";

import { publicEnv } from "@/lib/env/public";

export interface AuthMethods {
  google: boolean;
  guest: boolean;
}

/**
 * Which sign-in methods are switched on in the Supabase dashboard, read from the public
 * `/auth/v1/settings` endpoint (cached 5 minutes). Buttons for disabled methods are hidden,
 * so users never hit a "provider is not enabled" error page.
 */
export async function getAuthMethods(): Promise<AuthMethods> {
  try {
    const env = publicEnv();
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      next: { revalidate: 300 },
    });
    if (!res.ok) return { google: false, guest: false };
    const settings = (await res.json()) as { external?: Record<string, boolean> };
    return {
      google: settings.external?.google === true,
      guest: settings.external?.anonymous_users === true,
    };
  } catch {
    return { google: false, guest: false };
  }
}
