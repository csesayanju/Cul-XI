"use server";

import { revalidatePath } from "next/cache";

import { guessCareer, type CareerView } from "@/features/career/server";
import type { HolPick } from "@/features/higher-lower/game";
import { answerHol, type HolView } from "@/features/higher-lower/server";
import { triviaDay } from "@/features/trivia/game";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CareerResult =
  | { ok: true; game: CareerView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

/** A Career Path guess, checked on the server (today's player never reaches the browser). */
export async function careerGuess(playerId: number): Promise<CareerResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };
  const result = await guessCareer(createAdminClient(), user.id, triviaDay(), playerId);
  if (!result) return { ok: false, message: "There's no Career Path today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/career");
  switch (outcome.kind) {
    case "correct":
      return { ok: true, game, tone: "success", message: "Got him! 🎯" };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished ? "Out of guesses." : "Not him — a new hint is unlocked.",
      };
    case "repeat":
      return { ok: true, game, tone: "info", message: "You've already guessed him." };
    case "over":
      return { ok: true, game, tone: "info", message: "Today's puzzle is done — back tomorrow." };
  }
}

export type HolResult =
  | {
      ok: true;
      right: boolean;
      revealed: { aGoals: number; bGoals: number; bName: string };
      next: HolView;
    }
  | { ok: false; message: string };

/** A Higher or Lower call, judged on the server. */
export async function holAnswer(pick: HolPick): Promise<HolResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (pick !== "higher" && pick !== "lower") return { ok: false, message: "Pick higher or lower." };
  const result = await answerHol(createAdminClient(), user.id, pick);
  if (!result) return { ok: false, message: "Reload to start a new game." };
  return {
    ok: true,
    right: result.right,
    revealed: {
      aGoals: result.revealed.a.goals,
      bGoals: result.revealed.b.goals,
      bName: result.revealed.b.name,
    },
    next: result.next,
  };
}
