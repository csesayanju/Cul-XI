"use server";

import { revalidatePath } from "next/cache";

import { giveUp, isDailyGame, playable } from "@/features/boards/server";
import { triviaDay } from "@/features/trivia/game";
import { getSessionUser } from "@/lib/auth";
import { trackedLeagues } from "@/lib/highlightly/server";
import { createAdminClient } from "@/lib/supabase/admin";

import type { FormState } from "./auth";

/** "Give up & reveal": ends a daily game (today or an archive day) and shows the answers. */
export async function giveUpGame(game: string, archiveDay?: string): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!isDailyGame(game)) return { ok: false, message: "Unknown game." };
  const today = triviaDay();
  const day = archiveDay ?? today;
  const db = createAdminClient();
  const gate = await playable(db, game, user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const t = trackedLeagues();
  const done = await giveUp(db, game, user.id, day, {
    barcaTeamId: t.barcaTeamId,
    season: t.season,
  });
  if (!done) return { ok: false, message: "There's no puzzle for that day." };
  revalidatePath("/trivia", "layout");
  return { ok: true, message: "Answers revealed." };
}
