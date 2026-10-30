"use server";

import { revalidatePath } from "next/cache";

import { guessCareer, type CareerView } from "@/features/career/server";
import { guessConnections, type ConnectionsView } from "@/features/connections/server";
import { guessXi, type XiView } from "@/features/missing-xi/server";
import { answerOoo, type OooView } from "@/features/odd-one-out/server";
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

// ---------------------------------------------------------------------------------------
// Connections, Odd One Out, Missing XI
// ---------------------------------------------------------------------------------------

export type ConnectionsResult =
  | { ok: true; game: ConnectionsView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

export async function connectionsGuess(pick: number[]): Promise<ConnectionsResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (
    !Array.isArray(pick) ||
    pick.length !== 4 ||
    !pick.every((id) => Number.isInteger(id) && id > 0)
  ) {
    return { ok: false, message: "Pick four players." };
  }
  const result = await guessConnections(createAdminClient(), user.id, triviaDay(), pick);
  if (!result) return { ok: false, message: "There's no Connections today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/connections");
  switch (outcome.kind) {
    case "correct":
      return {
        ok: true,
        game,
        tone: "success",
        message: game.finished ? "All four groups! 🏆" : "Nice one!",
      };
    case "one-away":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished ? "Out of mistakes." : "One away…",
      };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished ? "Out of mistakes." : "Not a group.",
      };
    case "invalid":
      return { ok: true, game, tone: "info", message: "Pick four players still on the board." };
    case "over":
      return { ok: true, game, tone: "info", message: "Today's puzzle is done — back tomorrow." };
  }
}

export type OooResult =
  | { ok: true; right: boolean; answer: { id: number; name: string }; next: OooView }
  | { ok: false; message: string };

export async function oooAnswer(pick: number): Promise<OooResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(pick) || pick <= 0) return { ok: false, message: "Pick a player." };
  const result = await answerOoo(createAdminClient(), user.id, pick);
  if (!result) return { ok: false, message: "Reload to start a new round." };
  return { ok: true, ...result };
}

export type XiResult =
  | { ok: true; game: XiView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

export async function xiGuess(playerId: number): Promise<XiResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };
  const result = await guessXi(createAdminClient(), user.id, triviaDay(), playerId);
  if (!result) return { ok: false, message: "There's no Missing XI today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/missing-xi");
  switch (outcome.kind) {
    case "correct":
      return {
        ok: true,
        game,
        tone: "success",
        message:
          game.found === game.slots.length
            ? "Full XI! 🏆"
            : `Yes — ${game.slots[outcome.slot]!.pos}.`,
      };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished ? "Out of lives." : "Not in this XI. You lose a life.",
      };
    case "repeat":
      return { ok: true, game, tone: "info", message: "You've already tried him." };
    case "over":
      return { ok: true, game, tone: "info", message: "Today's XI is done — back tomorrow." };
  }
}
