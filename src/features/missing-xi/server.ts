import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daySeed } from "@/features/career/career";

import {
  applyXiGuess,
  layoutXI,
  NEW_XI,
  XI_LIVES,
  type XiOutcome,
  type XiSlot,
  type XiState,
} from "./game";

/** The day's line-up is the answer: everything here uses the service-role client. */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const GAP_DAYS = 60;

/** The competition's name in that year (European Cup → Champions League from 1993…). */
const competitionName = (competition: string, year: number) =>
  competition === "European Cup" && year >= 1993
    ? "Champions League"
    : competition === "UEFA Cup" && year >= 2010
      ? "Europa League"
      : competition;

interface Lineup {
  id: number;
  title: string;
  competition: string;
  year: number;
  team: string;
  players: XiSlot[];
}

async function loadLineup(db: SupabaseClient, id: number): Promise<Lineup> {
  const data = check(
    await db
      .from("trivia_lineups")
      .select("id, title, competition, year, team, players")
      .eq("id", id)
      .single(),
    "load line-up",
  ) as Lineup;
  return { ...data, players: data.players.map((p) => ({ ...p, playerId: Number(p.playerId) })) };
}

export async function ensureXiDay(db: SupabaseClient, day: string): Promise<Lineup | null> {
  const { data } = await db.from("lineup_daily").select("lineup_id").eq("day", day).maybeSingle();
  if (data) return loadLineup(db, Number(data.lineup_id));

  const { data: all } = await db.from("trivia_lineups").select("id").order("id");
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - GAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: recent } = await db.from("lineup_daily").select("lineup_id").gte("day", since);
  const used = new Set((recent ?? []).map((r) => Number(r.lineup_id)));
  const ids = (all ?? []).map((r) => Number(r.id));
  const pool = ids.filter((id) => !used.has(id));
  const from = pool.length ? pool : ids;
  if (from.length === 0) return null;
  const pick = from[daySeed(day) % from.length]!;
  await db
    .from("lineup_daily")
    .upsert({ day, lineup_id: pick }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db.from("lineup_daily").select("lineup_id").eq("day", day).single();
  return loadLineup(db, saved ? Number(saved.lineup_id) : pick);
}

export interface XiView {
  day: string;
  title: string;
  team: string;
  competition: string;
  year: number;
  slots: {
    pos: string;
    number: number | null;
    captain: boolean;
    x: number;
    y: number;
    countryCode: string | null;
    /** Set once found, or for every slot when the game is over. */
    answer: { name: string; found: boolean } | null;
  }[];
  found: number;
  livesLeft: number;
  lives: number;
  finished: boolean;
  wrong: string[];
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<XiState> {
  const { data } = await db
    .from("lineup_attempts")
    .select("guesses, lives_left, finished")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data
    ? {
        guesses: data.guesses as XiState["guesses"],
        livesLeft: data.lives_left,
        finished: data.finished,
      }
    : NEW_XI;
}

async function view(
  db: SupabaseClient,
  day: string,
  lineup: Lineup,
  state: XiState,
): Promise<XiView> {
  const ids = [
    ...new Set([...lineup.players.map((p) => p.playerId), ...state.guesses.map((g) => g.playerId)]),
  ];
  const { data } = await db.from("trivia_players").select("id, name, country_code").in("id", ids);
  const byId = new Map((data ?? []).map((p) => [Number(p.id), p]));
  const foundSlots = new Set(state.guesses.filter((g) => g.slot != null).map((g) => g.slot!));
  const at = layoutXI(lineup.players.map((p) => p.pos));
  return {
    day,
    title: lineup.title,
    team: lineup.team,
    competition: competitionName(lineup.competition, lineup.year),
    year: lineup.year,
    slots: lineup.players.map((p, i) => {
      const found = foundSlots.has(i);
      const person = byId.get(p.playerId);
      return {
        pos: p.pos,
        number: p.number,
        captain: p.captain,
        x: at[i]!.x,
        y: at[i]!.y,
        countryCode: (person?.country_code as string | null) ?? null,
        answer: found || state.finished ? { name: (person?.name as string) ?? "?", found } : null,
      };
    }),
    found: foundSlots.size,
    livesLeft: state.livesLeft,
    lives: XI_LIVES,
    finished: state.finished,
    wrong: state.guesses
      .filter((g) => g.slot == null)
      .map((g) => (byId.get(g.playerId)?.name as string) ?? "?"),
  };
}

export async function getXi(db: SupabaseClient, userId: string, day: string) {
  const lineup = await ensureXiDay(db, day);
  if (!lineup) return null;
  return view(db, day, lineup, await loadAttempt(db, userId, day));
}

export async function guessXi(
  db: SupabaseClient,
  userId: string,
  day: string,
  playerId: number,
): Promise<{ game: XiView; outcome: XiOutcome } | null> {
  const lineup = await ensureXiDay(db, day);
  if (!lineup) return null;
  const before = await loadAttempt(db, userId, day);
  const { state, outcome } = applyXiGuess(lineup.players, before, playerId);
  if (state !== before) {
    check(
      await db.from("lineup_attempts").upsert(
        {
          user_id: userId,
          day,
          guesses: state.guesses,
          found: state.guesses.filter((g) => g.slot != null).length,
          lives_left: state.livesLeft,
          finished: state.finished,
        },
        { onConflict: "user_id,day" },
      ),
      "save attempt",
    );
  }
  return { game: await view(db, day, lineup, state), outcome };
}

export async function xiTable(db: SupabaseClient, day: string) {
  const { data } = await db
    .from("lineup_attempts")
    .select("user_id, found, lives_left, finished")
    .eq("day", day);
  return (data ?? []) as {
    user_id: string;
    found: number;
    lives_left: number;
    finished: boolean;
  }[];
}
