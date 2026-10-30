import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { eraOf } from "@/features/trivia/history-lists";

import { applyHol, nextOpponent, type HolPick, type HolRun } from "./game";

/**
 * Higher or Lower on La Liga goals (players with 100+, from Wikipedia). The current pair and
 * streak live on the server (service role), so the hidden number can't be peeked at and
 * streaks can't be faked.
 */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

interface PoolPlayer {
  id: number;
  name: string;
  countryCode: string | null;
  goals: number;
  era: string | null;
}

async function loadPool(db: SupabaseClient): Promise<Map<number, PoolPlayer>> {
  const rows = check(
    await db
      .from("trivia_players")
      .select("id, name, country_code, liga_goals, birth_year")
      .gte("liga_goals", 100),
    "load players",
  ) as {
    id: number;
    name: string;
    country_code: string | null;
    liga_goals: number;
    birth_year: number | null;
  }[];
  return new Map(
    rows.map((r) => [
      Number(r.id),
      {
        id: Number(r.id),
        name: r.name,
        countryCode: r.country_code,
        goals: r.liga_goals,
        // Roughly when they played: from their 20s.
        era: r.birth_year ? eraOf(r.birth_year + 20, r.birth_year + 32) : null,
      },
    ]),
  );
}

export interface HolView {
  a: PoolPlayer;
  /** B's goals are hidden until you call it. */
  b: Omit<PoolPlayer, "goals">;
  streak: number;
  best: number;
}

const toView = (run: HolRun, pool: Map<number, PoolPlayer>): HolView => {
  const b = pool.get(run.bId)!;
  return {
    a: pool.get(run.aId)!,
    b: { id: b.id, name: b.name, countryCode: b.countryCode, era: b.era },
    streak: run.streak,
    best: run.best,
  };
};

async function save(db: SupabaseClient, userId: string, run: HolRun) {
  check(
    await db
      .from("hol_runs")
      .upsert(
        { user_id: userId, a_id: run.aId, b_id: run.bId, streak: run.streak, best: run.best },
        { onConflict: "user_id" },
      ),
    "save run",
  );
}

/** The user's current pair (a fresh one on first play, or if a player left the pool). */
export async function getHol(db: SupabaseClient, userId: string): Promise<HolView | null> {
  const pool = await loadPool(db);
  const ids = [...pool.keys()];
  if (ids.length < 2) return null;
  const { data } = await db
    .from("hol_runs")
    .select("a_id, b_id, streak, best")
    .eq("user_id", userId)
    .maybeSingle();
  let run: HolRun | null = data
    ? { aId: Number(data.a_id), bId: Number(data.b_id), streak: data.streak, best: data.best }
    : null;
  if (!run || !pool.has(run.aId) || !pool.has(run.bId)) {
    const aId = nextOpponent(ids, [])!;
    run = { aId, bId: nextOpponent(ids, [aId])!, streak: 0, best: run?.best ?? 0 };
    await save(db, userId, run);
  }
  return toView(run, pool);
}

export async function answerHol(
  db: SupabaseClient,
  userId: string,
  pick: HolPick,
): Promise<{ right: boolean; revealed: { a: PoolPlayer; b: PoolPlayer }; next: HolView } | null> {
  const pool = await loadPool(db);
  const { data } = await db
    .from("hol_runs")
    .select("a_id, b_id, streak, best")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const run: HolRun = {
    aId: Number(data.a_id),
    bId: Number(data.b_id),
    streak: data.streak,
    best: data.best,
  };
  const a = pool.get(run.aId);
  const b = pool.get(run.bId);
  if (!a || !b) return null;
  const { run: next, right } = applyHol(run, { a: a.goals, b: b.goals }, pick, [...pool.keys()]);
  await save(db, userId, next);
  return { right, revealed: { a, b }, next: toView(next, pool) };
}

/** Best streaks of the user's league-mates (RLS limits rows). */
export async function holTable(db: SupabaseClient) {
  const { data } = await db.from("hol_runs").select("user_id, best, streak");
  return (data ?? []) as { user_id: string; best: number; streak: number }[];
}
