"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { EMPTY_FORM, priceFor, type PlayerForm } from "@/features/fantasy/pricing";
import { createSyncContext, type SyncResult } from "@/features/fantasy/sync/context";
import { recalculatePoints } from "@/features/fantasy/sync/recalculate-points";
import { syncFixtures } from "@/features/fantasy/sync/sync-fixtures";
import { syncLineups } from "@/features/fantasy/sync/sync-lineups";
import { syncSquads } from "@/features/fantasy/sync/sync-squads";
import { syncStats } from "@/features/fantasy/sync/sync-stats";
import type { Position } from "@/features/fantasy/types";
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

const idsSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  playerId: z.coerce.number().int().positive(),
});

const priceSchema = z.object({
  price: z.coerce.number().positive().max(20).multipleOf(0.5),
  priceLocked: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});

const statsSchema = z.object({
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

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0]!;
  return { ok: false, message: `${issue.path.join(".")}: ${issue.message}` };
}

/**
 * Admin edits from /admin, as two separate actions so a price change never creates a stat line:
 *  - intent "price": set + lock a price, or unlock it (back to automatic, form-based pricing);
 *  - intent "stats": save a manual stat line (source = 'manual', so API syncs never overwrite
 *    it) and recalculate the match's points.
 * Writes go through the admin's own session, so RLS ("admins write") authorises them.
 */
export async function saveManualStats(
  _prev: FormState | null,
  formData: FormData,
): Promise<FormState> {
  try {
    const admin = await assertAdmin();
    const fields = Object.fromEntries(formData);
    const ids = idsSchema.safeParse(fields);
    if (!ids.success) return firstIssue(ids.error);
    const { matchId, playerId } = ids.data;
    const supabase = await createClient();

    if (fields.intent === "price") {
      const parsed = priceSchema.safeParse(fields);
      if (!parsed.success) return firstIssue(parsed.error);
      const { price, priceLocked } = parsed.data;

      let update: { price: number; price_locked: boolean };
      if (priceLocked) {
        update = { price, price_locked: true };
      } else {
        const { data: player, error } = await supabase
          .from("players")
          .select("position, form")
          .eq("id", playerId)
          .single();
        if (error || !player) return { ok: false, message: "Player not found." };
        const form = { ...EMPTY_FORM, ...(player.form as Partial<PlayerForm>) };
        update = { price: priceFor(player.position as Position, form), price_locked: false };
      }
      const { error } = await supabase.from("players").update(update).eq("id", playerId);
      if (error) return { ok: false, message: `Price not saved: ${error.message}` };
      revalidatePath("/", "layout");
      return {
        ok: true,
        message: update.price_locked
          ? `Price locked at ${update.price}.`
          : `Back to automatic pricing: ${update.price} from recent form.`,
      };
    }

    const parsed = statsSchema.safeParse(fields);
    if (!parsed.success) return firstIssue(parsed.error);
    const s = parsed.data;

    const { error: statsError } = await supabase.from("player_match_stats").upsert(
      {
        match_id: matchId,
        player_id: playerId,
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

    const points = await recalculatePoints(createSyncContext(), matchId);
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved as manual override. ${points.message}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Save failed." };
  }
}
