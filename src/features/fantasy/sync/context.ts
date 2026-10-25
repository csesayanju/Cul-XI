import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HighlightlyClient } from "@/lib/highlightly/client";
import type { TrackedLeagues } from "@/lib/highlightly/mappers";
import { getHighlightly, trackedLeagues } from "@/lib/highlightly/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SyncContext {
  db: SupabaseClient;
  api: HighlightlyClient;
  config: TrackedLeagues & { season: number };
  now: Date;
}

export function createSyncContext(): SyncContext {
  return {
    db: createAdminClient(),
    api: getHighlightly(),
    config: trackedLeagues(),
    now: new Date(),
  };
}

export interface SyncResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export const HOUR = 60 * 60 * 1000;
export const DAY = 24 * HOUR;

/** Throws a readable error for a failed Supabase call. */
export function check<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

export interface MatchRecord {
  id: number;
  api_fixture_id: number;
  opponent_team_id: number;
  opponent_name: string;
  kickoff_at: string;
  status: string;
  barca_goals: number | null;
  opponent_goals: number | null;
  squads_synced_at: string | null;
  lineups_synced_at: string | null;
  stats_synced_at: string | null;
}

export const MATCH_COLUMNS =
  "id, api_fixture_id, opponent_team_id, opponent_name, kickoff_at, status, barca_goals, opponent_goals, squads_synced_at, lineups_synced_at, stats_synced_at";
