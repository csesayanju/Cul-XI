import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/env/server";

let cached: SupabaseClient | undefined;

/**
 * Service-role client: BYPASSES row-level security. Only for trusted server code
 * (sync jobs, API cache, granting admin). Never pass its results to the client unfiltered.
 */
export function createAdminClient(): SupabaseClient {
  if (!cached) {
    const env = serverEnv();
    cached = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
