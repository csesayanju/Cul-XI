"use server";

import { revalidatePath } from "next/cache";

import { guessCareer, type CareerView } from "@/features/career/server";
import { guessConnections, type ConnectionsView } from "@/features/connections/server";
import { guessXi, type XiView } from "@/features/missing-xi/server";
import { guessMystery, type MysteryView } from "@/features/mystery/server";
import { answerOoo, type OooView } from "@/features/odd-one-out/server";
import type { HolPick } from "@/features/higher-lower/game";
import { answerHol, type HolView } from "@/features/higher-lower/server";
import { playable } from "@/features/boards/server";
import { seasonLabel } from "@/features/which-season/season";
import { guessSeason, type SeasonView } from "@/features/which-season/server";
import { triviaDay } from "@/features/trivia/game";
import { getSessionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CareerResult =
  | { ok: true; game: CareerView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

/** A Career Path guess, checked on the server (today's player never reaches the browser). */
export async function careerGuess(playerId: number, archiveDay?: string): Promise<CareerResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };
  // Today, or a missed archive day (last 15 days; practice, never on leaderboards).
  const today = triviaDay();
  const day = archiveDay ?? today;
  const gate = await playable(createAdminClient(), "career", user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await guessCareer(createAdminClient(), user.id, day, playerId);
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

export async function connectionsGuess(
  pick: number[],
  archiveDay?: string,
): Promise<ConnectionsResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (
    !Array.isArray(pick) ||
    pick.length !== 4 ||
    !pick.every((id) => Number.isInteger(id) && id > 0)
  ) {
    return { ok: false, message: "Pick four players." };
  }
  // Today, or a missed archive day (last 15 days; practice, never on leaderboards).
  const today = triviaDay();
  const day = archiveDay ?? today;
  const gate = await playable(createAdminClient(), "connections", user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await guessConnections(createAdminClient(), user.id, day, pick);
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

export async function xiGuess(playerId: number, archiveDay?: string): Promise<XiResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };
  // Today, or a missed archive day (last 15 days; practice, never on leaderboards).
  const today = triviaDay();
  const day = archiveDay ?? today;
  const gate = await playable(createAdminClient(), "missing-xi", user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await guessXi(createAdminClient(), user.id, day, playerId);
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

export type MysteryResult =
  | { ok: true; game: MysteryView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

/** A Mystery Player guess, compared on the server (today's player never reaches the browser). */
export async function mysteryGuess(playerId: number, archiveDay?: string): Promise<MysteryResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };
  // Today, or a missed archive day (last 15 days; practice, never on leaderboards).
  const today = triviaDay();
  const day = archiveDay ?? today;
  const gate = await playable(createAdminClient(), "mystery", user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await guessMystery(createAdminClient(), user.id, day, playerId);
  if (!result) return { ok: false, message: "There's no Mystery Player today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/mystery");
  switch (outcome.kind) {
    case "correct":
      return { ok: true, game, tone: "success", message: "That's him! 🎯" };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished ? "Out of guesses." : "Not him — check the clues.",
      };
    case "repeat":
      return { ok: true, game, tone: "info", message: "You've already guessed him." };
    case "over":
      return {
        ok: true,
        game,
        tone: "info",
        message: "Today's mystery is solved — back tomorrow.",
      };
  }
}

export type SeasonResult =
  | { ok: true; game: SeasonView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

/** A Which Season? guess (a season's start year), checked on the server. */
export async function seasonGuess(startYear: number, archiveDay?: string): Promise<SeasonResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(startYear)) return { ok: false, message: "Pick a season." };
  const today = triviaDay();
  const day = archiveDay ?? today;
  const gate = await playable(createAdminClient(), "season", user.id, day, today);
  if (!gate.ok) return { ok: false, message: gate.message };
  const result = await guessSeason(createAdminClient(), user.id, day, startYear);
  if (!result) return { ok: false, message: "There's no season to guess today." };
  const { game, outcome } = result;
  revalidatePath("/trivia/season");
  switch (outcome.kind) {
    case "correct":
      return {
        ok: true,
        game,
        tone: "success",
        message: `${seasonLabel(startYear)} — nailed it! 🎯`,
      };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished
          ? "Out of guesses."
          : `Not ${seasonLabel(startYear)}: go ${outcome.direction}${outcome.off <= 3 ? " — so close!" : "."} New clue unlocked.`,
      };
    case "repeat":
      return { ok: true, game, tone: "info", message: "You've already tried that season." };
    case "invalid":
      return { ok: true, game, tone: "info", message: "Pick a season from the list." };
    case "over":
      return { ok: true, game, tone: "info", message: "Today's puzzle is done — back tomorrow." };
  }
}
