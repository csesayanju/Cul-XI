import "server-only";

import { serverEnv } from "@/lib/env/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { createApiFootballClient, type ApiCache, type ApiFootballClient } from "./client";
import type { TrackedLeagues } from "./mappers";

/** API cache stored in the `api_cache` table (service role only). */
export function supabaseApiCache(): ApiCache {
  const db = createAdminClient();
  return {
    async get(endpoint, paramsHash) {
      const { data, error } = await db
        .from("api_cache")
        .select("response, fetched_at")
        .eq("endpoint", endpoint)
        .eq("params_hash", paramsHash)
        .maybeSingle();
      if (error) throw new Error(`api_cache read failed: ${error.message}`);
      return data ? { response: data.response, fetchedAt: new Date(data.fetched_at) } : null;
    },
    async set(endpoint, paramsHash, params, response) {
      const { error } = await db.from("api_cache").upsert(
        {
          endpoint,
          params_hash: paramsHash,
          params,
          response,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "endpoint,params_hash" },
      );
      if (error) throw new Error(`api_cache write failed: ${error.message}`);
    },
  };
}

let client: ApiFootballClient | undefined;

/** Shared, cache-backed API-Football client for server code. */
export function getApiFootball(): ApiFootballClient {
  if (!client) {
    const env = serverEnv();
    client = createApiFootballClient({
      apiKey: env.API_FOOTBALL_KEY,
      baseUrl: env.API_FOOTBALL_BASE_URL,
      cache: supabaseApiCache(),
    });
  }
  return client;
}

export function trackedLeagues(): TrackedLeagues & { season: number } {
  const env = serverEnv();
  return {
    barcaTeamId: env.BARCA_TEAM_ID,
    laligaLeagueId: env.LALIGA_LEAGUE_ID,
    uclLeagueId: env.UCL_LEAGUE_ID,
    copaLeagueId: env.COPA_DEL_REY_LEAGUE_ID,
    season: env.CURRENT_SEASON,
  };
}
