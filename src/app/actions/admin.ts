"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSyncContext, type SyncResult } from "@/features/fantasy/sync/context";
import { recalculatePoints } from "@/features/fantasy/sync/recalculate-points";
import { syncFixtures } from "@/features/fantasy/sync/sync-fixtures";
import { syncLineups } from "@/features/fantasy/sync/sync-lineups";
import { syncSquads } from "@/features/fantasy/sync/sync-squads";
import { syncStats } from "@/features/fantasy/sync/sync-stats";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import type { FormState } from "./auth";

async function assertAdmin() {
  const user = await getSessionUser();
  if (!user?.profile?.is_admin) throw new Error("Admins only.");
  return user;
}

const JOBS = {
  fixtures: () => syncFixtures(createSyncContext()),
  squads: (matchId?: number) => syncSquads(createSyncContext(), { matchId }),
  lineups: (matchId?: number) => syncLineups(createSyncContext(), { matchId }),
  stats: (matchId?: number) => syncStats(createSyncContext(), { matchId }),
  points: async (matchId?: number): Promise<SyncResult> => {
    if (!matchId) return { ok: false, message: "Choose a match to recalculate." };
    return recalculatePoints(createSyncContext(), matchId);
  },
} as const;

export type AdminJob = keyof typeof JOBS;

export async function runAdminJob(_prev: FormState | null, formData: FormData): Promise<FormState> {
  try {
    await assertAdmin();
    const job = String(formData.get("job")) as AdminJob;
    if (!(job in JOBS)) return { ok: false, message: "Unknown job." };
    const matchIdRaw = formData.get("matchId");
    const matchId = matchIdRaw ? Number(matchIdRaw) : undefined;
    const result = await JOBS[job](Number.isFinite(matchId) ? matchId : undefined);
    revalidatePath("/", "layout");
    return { ok: result.ok, message: result.message };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Job failed." };
  }
}

const int = (max: number) => z.coerce.number().int().min(0).max(max);

const statsSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  playerId: z.coerce.number().int().positive(),
  price: z.coerce.number().positive().max(20).multipleOf(0.5),
  minutes: int(130),
  goals: int(10),
  assists: int(10),
  cleanSheet: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  saves: int(30),
  goalsConceded: int(15),
  yellowCards: int(2),
  redCards: int(1),
  penaltiesMissed: int(5),
  penaltiesSaved: int(5),
  ownGoals: int(5),
});

/**
 * Saves a manual stat line (source = 'manual', so API syncs never overwrite it), updates the
 * player's price, then recalculates the match's points. Writes go through the admin's own
 * session, so the "admins write stats" RLS policy is what authorises them.
 */
export async function saveManualStats(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  try {
    const admin = await assertAdmin();
    const parsed = statsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return { ok: false, message: `${issue.path.join(".")}: ${issue.message}` };
    }
    const s = parsed.data;
    const supabase = await createClient();

    const { error: statsError } = await supabase.from("player_match_stats").upsert(
      {
        match_id: s.matchId,
        player_id: s.playerId,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        clean_sheet: s.cleanSheet,
        saves: s.saves,
        goals_conceded: s.goalsConceded,
        yellow_cards: s.yellowCards,
        red_cards: s.redCards,
        penalties_missed: s.penaltiesMissed,
        penalties_saved: s.penaltiesSaved,
        own_goals: s.ownGoals,
        source: "manual",
        updated_by: admin.id,
      },
      { onConflict: "match_id,player_id" },
    );
    if (statsError) return { ok: false, message: `Stats not saved: ${statsError.message}` };

    const { error: priceError } = await supabase
      .from("players")
      .update({ price: s.price })
      .eq("id", s.playerId);
    if (priceError) return { ok: false, message: `Price not saved: ${priceError.message}` };

    const points = await recalculatePoints(createSyncContext(), s.matchId);
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved as manual override. ${points.message}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Save failed." };
  }
}
