import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cachedCategories, fameOrder } from "@/features/tiki-taka-toe/server";

import { makeRound, scoreOoo, type OooCategory, type OooRound } from "./game";

/**
 * Odd One Out, endless. The current round (and its answer) is kept on the server; players
 * can read scores but never the round row (column grants in the migration).
 */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const AWARD_PROMPTS: Record<string, string> = {
  pichichi: "Who never won the Pichichi?",
  zamora: "Who never won the Zamora?",
  liga100: "Who never scored 100 La Liga goals?",
  ballondor: "Who never made a Ballon d'Or podium?",
};

async function categories(db: SupabaseClient): Promise<{ cats: OooCategory[]; famous: number[] }> {
  const [{ cats, sets }, fame] = await Promise.all([cachedCategories(db), fameOrder(db, 500)]);
  const out: OooCategory[] = [];
  for (const c of cats) {
    const ids = sets.get(`${c.type}:${c.key}`) ?? [];
    if (c.type === "club") out.push({ prompt: `Who never played for ${c.label}?`, ids });
    else if (c.type === "nation") out.push({ prompt: `Who isn't from ${c.label}?`, ids });
    else if (c.type === "award" && AWARD_PROMPTS[c.key])
      out.push({ prompt: AWARD_PROMPTS[c.key]!, ids });
  }
  // Only categories with enough famous members make good rounds.
  const famousSet = new Set(fame.ids);
  return {
    cats: out.filter((c) => c.ids.filter((id) => famousSet.has(id)).length >= 6),
    famous: fame.ids,
  };
}

export interface OooView {
  prompt: string;
  options: { id: number; name: string }[];
  streak: number;
  best: number;
}

async function names(db: SupabaseClient, ids: number[]) {
  const { data } = await db.from("trivia_players").select("id, name").in("id", ids);
  const byId = new Map((data ?? []).map((p) => [Number(p.id), p.name as string]));
  return ids.map((id) => ({ id, name: byId.get(id) ?? "?" }));
}

async function newRound(db: SupabaseClient): Promise<OooRound> {
  const { cats, famous } = await categories(db);
  const round = makeRound(cats, famous);
  if (!round) throw new Error("Odd One Out: not enough data for a round.");
  return round;
}

async function save(
  db: SupabaseClient,
  userId: string,
  round: OooRound,
  score: { streak: number; best: number },
) {
  check(
    await db.from("ooo_runs").upsert(
      {
        user_id: userId,
        round: { prompt: round.prompt, options: round.options },
        answer_id: round.answerId,
        streak: score.streak,
        best: score.best,
      },
      { onConflict: "user_id" },
    ),
    "save round",
  );
}

export async function getOoo(db: SupabaseClient, userId: string): Promise<OooView> {
  const { data } = await db
    .from("ooo_runs")
    .select("round, streak, best")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) {
    const round = data.round as { prompt: string; options: number[] };
    return {
      prompt: round.prompt,
      options: await names(db, round.options),
      streak: data.streak,
      best: data.best,
    };
  }
  const round = await newRound(db);
  await save(db, userId, round, { streak: 0, best: 0 });
  return { prompt: round.prompt, options: await names(db, round.options), streak: 0, best: 0 };
}

export async function answerOoo(
  db: SupabaseClient,
  userId: string,
  pick: number,
): Promise<{ right: boolean; answer: { id: number; name: string }; next: OooView } | null> {
  const { data } = await db
    .from("ooo_runs")
    .select("answer_id, streak, best")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const answerId = Number(data.answer_id);
  const right = pick === answerId;
  const score = scoreOoo({ streak: data.streak, best: data.best }, right);
  const round = await newRound(db);
  await save(db, userId, round, score);
  const [answer] = await names(db, [answerId]);
  return {
    right,
    answer: answer!,
    next: { prompt: round.prompt, options: await names(db, round.options), ...score },
  };
}

export async function oooTable(db: SupabaseClient) {
  const { data } = await db.from("ooo_runs").select("user_id, best, streak");
  return (data ?? []) as { user_id: string; best: number; streak: number }[];
}
