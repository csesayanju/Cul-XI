"use server";

import { revalidatePath } from "next/cache";

import { guessTtt, type TttView } from "@/features/tiki-taka-toe/server";
import { triviaDay } from "@/features/trivia/game";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type TttResult =
  | { ok: true; game: TttView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

export async function tttGuess(cell: number, playerId: number): Promise<TttResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(cell) || cell < 0 || cell > 8)
    return { ok: false, message: "Pick a cell." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };

  // Checked on the server with the service role; the grid's example answers never leave it.
  const result = await guessTtt(createAdminClient(), user.id, triviaDay(), cell, playerId);
  if (!result) return { ok: false, message: "There's no grid today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/grid");
  switch (outcome.kind) {
    case "correct":
      return { ok: true, game, tone: "success", message: "Correct!" };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished
          ? "Doesn't fit — that was your last guess."
          : "Doesn't fit that cell.",
      };
    case "used":
      return { ok: true, game, tone: "info", message: "You've already used that player." };
    case "taken":
      return { ok: true, game, tone: "info", message: "That cell is already filled." };
    case "over":
      return {
        ok: true,
        game,
        tone: "info",
        message: "Today's grid is done — come back tomorrow.",
      };
  }
}
