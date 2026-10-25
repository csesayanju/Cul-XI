"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getMatch, listMatchPlayers } from "@/features/fantasy/queries";
import { validateTeam } from "@/features/fantasy/validation/validate-team";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasKickedOff } from "@/lib/time";

import type { FormState } from "./auth";

const saveSchema = z.object({
  matchId: z.number().int().positive(),
  playerIds: z.array(z.number().int().positive()).max(20),
  captainId: z.number().int().positive().nullable(),
  viceCaptainId: z.number().int().positive().nullable(),
});

export type SaveTeamInput = z.infer<typeof saveSchema>;

/**
 * Validates the XI on the server with authoritative prices/positions, then saves it
 * atomically via the `save_fantasy_team` RPC (RLS + kickoff lock enforced in the DB).
 */
export async function saveTeam(input: SaveTeamInput): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Your session expired. Sign in again." };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid team data." };
  const { matchId, playerIds, captainId, viceCaptainId } = parsed.data;

  const supabase = await createClient();
  const match = await getMatch(supabase, matchId);
  if (!match) return { ok: false, message: "Match not found." };
  if (hasKickedOff(match.kickoff_at)) {
    return { ok: false, message: "This match has kicked off — teams are locked." };
  }

  const available = new Map((await listMatchPlayers(supabase, matchId)).map((p) => [p.id, p]));
  const picked = playerIds.map((id) => available.get(id));
  if (picked.some((p) => !p)) {
    return { ok: false, message: "Some players are no longer available. Refresh and try again." };
  }

  const result = validateTeam(
    {
      players: picked.map((p) => ({
        playerId: p!.id,
        position: p!.position,
        teamId: p!.teamId,
        price: p!.price,
      })),
      captainId,
      viceCaptainId,
    },
    { allowedTeamIds: [...new Set([...available.values()].map((p) => p.teamId))] },
  );
  if (!result.valid) return { ok: false, message: result.errors.map((e) => e.message).join(" ") };

  const { error } = await supabase.rpc("save_fantasy_team", {
    p_match_id: matchId,
    p_player_ids: playerIds,
    p_captain_id: captainId,
    p_vice_captain_id: viceCaptainId,
  });
  if (error) return { ok: false, message: `Could not save: ${error.message}` };

  revalidatePath("/matches");
  revalidatePath(`/matches/${matchId}/pick`);
  return { ok: true, message: `Team saved — ${result.remainingBudget} credits left in the bank.` };
}
