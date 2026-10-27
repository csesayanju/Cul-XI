"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { triviaDay } from "@/features/trivia/game";
import {
  importRepository,
  makeGuess,
  searchPlayers,
  type GameView,
  type SearchResult,
} from "@/features/trivia/server";
import { getSessionUser } from "@/lib/auth";
import { trackedLeagues } from "@/lib/highlightly/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { FormState } from "./auth";

const config = () => {
  const t = trackedLeagues();
  return { barcaTeamId: t.barcaTeamId, season: t.season };
};

export async function triviaSearch(query: string): Promise<SearchResult[]> {
  const user = await getSessionUser();
  if (!user || typeof query !== "string" || query.length > 60) return [];
  return searchPlayers(await createClient(), query);
}

export type GuessResult =
  | { ok: true; game: GameView; message: string; tone: "success" | "error" | "info" }
  | { ok: false; message: string };

export async function triviaGuess(playerId: number): Promise<GuessResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: "Sign in to play." };
  if (!Number.isInteger(playerId) || playerId <= 0) return { ok: false, message: "Pick a player." };

  // Answers are checked with the service role; the browser never sees them.
  const result = await makeGuess(createAdminClient(), user.id, triviaDay(), playerId, config());
  if (!result) return { ok: false, message: "There's no Culé Ten today." };
  const { game, outcome } = result;
  revalidatePath("/trivia");
  switch (outcome.kind) {
    case "correct":
      return { ok: true, game, tone: "success", message: `Yes! Number ${outcome.rank}.` };
    case "wrong":
      return {
        ok: true,
        game,
        tone: "error",
        message: game.finished
          ? "Not in the list — game over."
          : "Not in the list. You lose a life.",
      };
    case "repeat":
      return { ok: true, game, tone: "info", message: "You've already guessed that player." };
    case "over":
      return {
        ok: true,
        game,
        tone: "info",
        message: "Today's game is over — come back tomorrow.",
      };
  }
}

// ---------------------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------------------

async function assertAdmin() {
  const user = await getSessionUser();
  if (!user?.profile?.is_admin) throw new Error("Admins only.");
  return user;
}

export async function importTriviaRepository(): Promise<FormState> {
  try {
    await assertAdmin();
    const result = await importRepository(createAdminClient(), config().barcaTeamId);
    revalidatePath("/admin/trivia");
    return result;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Import failed." };
  }
}

const entriesSchema = z.object({
  listId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  subtitle: z.string().trim().max(200).optional(),
  entries: z
    .array(
      z.object({ playerId: z.number().int().positive(), statLabel: z.string().trim().max(40) }),
    )
    .length(10),
});

/** Saves a list's title and its 10 ranked answers (admin RLS authorises the writes). */
export async function saveTriviaList(input: z.input<typeof entriesSchema>): Promise<FormState> {
  try {
    await assertAdmin();
    const parsed = entriesSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };
    const { listId, title, subtitle, entries } = parsed.data;
    if (new Set(entries.map((e) => e.playerId)).size !== 10) {
      return { ok: false, message: "Each player can only appear once." };
    }
    const db = await createClient();
    const { error: listError } = await db
      .from("trivia_lists")
      .update({ title, subtitle: subtitle || null })
      .eq("id", listId);
    if (listError) return { ok: false, message: listError.message };
    const { error: delError } = await db.from("trivia_list_entries").delete().eq("list_id", listId);
    if (delError) return { ok: false, message: delError.message };
    const { error } = await db.from("trivia_list_entries").insert(
      entries.map((e, i) => ({
        list_id: listId,
        rank: i + 1,
        player_id: e.playerId,
        stat_label: e.statLabel || null,
      })),
    );
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/trivia");
    return { ok: true, message: "List saved." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Save failed." };
  }
}

export async function setTriviaListStatus(
  listId: string,
  status: "draft" | "approved" | "archived",
): Promise<FormState> {
  try {
    await assertAdmin();
    if (!z.uuid().safeParse(listId).success) return { ok: false, message: "Bad list id." };
    const db = await createClient();
    if (status === "approved") {
      const { count } = await db
        .from("trivia_list_entries")
        .select("rank", { count: "exact", head: true })
        .eq("list_id", listId);
      if (count !== 10)
        return { ok: false, message: "A list needs exactly 10 players to approve." };
    }
    const { error } = await db.from("trivia_lists").update({ status }).eq("id", listId);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/trivia");
    return { ok: true, message: `List ${status}.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Update failed." };
  }
}

export async function createTriviaList(title: string): Promise<FormState & { listId?: string }> {
  try {
    const admin = await assertAdmin();
    const t = title.trim();
    if (t.length < 3 || t.length > 120) return { ok: false, message: "Title: 3–120 characters." };
    const db = await createClient();
    const { data, error } = await db
      .from("trivia_lists")
      .insert({ title: t, kind: "curated", status: "draft", created_by: admin.id })
      .select("id")
      .single();
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/trivia");
    return { ok: true, message: "Draft created — add 10 players.", listId: data.id as string };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Create failed." };
  }
}
