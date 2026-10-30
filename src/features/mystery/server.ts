import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daySeed, pickCareerPlayer } from "@/features/career/career";
import { CLUB_NAMES } from "@/features/tiki-taka-toe/grid";

import {
  applyMysteryGuess,
  compare,
  MYSTERY_GUESSES,
  NEW_MYSTERY,
  type Clue,
  type MysteryOutcome,
  type MysteryPlayer,
  type MysteryState,
} from "./game";

/** The day's player is the answer: everything here uses the service-role client. */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const BARCA = "Q7156";
const POOL = 300;
const GAP_DAYS = 90;

/** "Manchester United F.C." -> "Manchester United". */
const tidy = (name: string) =>
  name.replace(/\s+(F\.?C\.?|C\.?F\.?|S\.?F\.?C\.?|A\.?F\.?C\.?)$/i, "").trim() || name;

export async function ensureMysteryDay(db: SupabaseClient, day: string): Promise<number | null> {
  const { data } = await db.from("mystery_daily").select("player_id").eq("day", day).maybeSingle();
  if (data) return Number(data.player_id);

  // Well-known La Liga players with everything the clues need.
  const candidates = check(
    await db
      .from("trivia_players")
      .select("id")
      .eq("liga", true)
      .contains("roles", ["player"])
      .not("country_code", "is", null)
      .not("position", "is", null)
      .not("birth_year", "is", null)
      .not("fame", "is", null)
      .order("fame", { ascending: false })
      .order("id")
      .limit(POOL),
    "load candidates",
  ) as { id: number }[];
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - GAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: recent } = await db.from("mystery_daily").select("player_id").gte("day", since);
  const pick = pickCareerPlayer(
    candidates.map((c) => Number(c.id)),
    new Set((recent ?? []).map((r) => Number(r.player_id))),
    daySeed(`mystery:${day}`),
  );
  if (pick == null) return null;
  await db
    .from("mystery_daily")
    .upsert({ day, player_id: pick }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db
    .from("mystery_daily")
    .select("player_id")
    .eq("day", day)
    .single();
  return saved ? Number(saved.player_id) : pick;
}

/** Players with everything the clues compare (one query each for people and clubs). */
async function loadPlayers(db: SupabaseClient, ids: number[]): Promise<Map<number, MysteryPlayer>> {
  if (ids.length === 0) return new Map();
  const [{ data: people }, { data: links }] = await Promise.all([
    db
      .from("trivia_players")
      .select("id, name, country_code, nationality, position, birth_year, barca_from")
      .in("id", ids),
    db
      .from("trivia_player_clubs")
      .select("player_id, trivia_clubs(qid, name, short_name)")
      .in("player_id", ids),
  ]);
  const clubs = new Map<number, Map<string, string>>();
  for (const l of (links ?? []) as unknown as {
    player_id: number;
    trivia_clubs: { qid: string; name: string; short_name: string | null } | null;
  }[]) {
    const c = l.trivia_clubs;
    if (!c) continue;
    const m = clubs.get(Number(l.player_id)) ?? new Map<string, string>();
    m.set(c.qid, c.short_name ?? CLUB_NAMES[c.name] ?? tidy(c.name));
    clubs.set(Number(l.player_id), m);
  }
  return new Map(
    (people ?? []).map((p) => {
      const id = Number(p.id);
      const own = clubs.get(id) ?? new Map<string, string>();
      return [
        id,
        {
          id,
          name: p.name as string,
          countryCode: p.country_code as string | null,
          nationality: p.nationality as string | null,
          position: p.position as string | null,
          birthYear: p.birth_year as number | null,
          clubs: own,
          barca: own.has(BARCA) || p.barca_from != null,
        },
      ];
    }),
  );
}

export interface MysteryView {
  day: string;
  clues: Clue[];
  guessesLeft: number;
  solved: boolean;
  finished: boolean;
  answer: { name: string; countryCode: string | null } | null;
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<MysteryState> {
  const { data } = await db
    .from("mystery_attempts")
    .select("guesses, solved, finished")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data
    ? {
        guesses: (data.guesses as number[]).map(Number),
        solved: data.solved,
        finished: data.finished,
      }
    : NEW_MYSTERY;
}

async function view(db: SupabaseClient, day: string, answerId: number, state: MysteryState) {
  const players = await loadPlayers(db, [answerId, ...state.guesses]);
  const answer = players.get(answerId);
  if (!answer) throw new Error("Mystery Player: today's player is missing.");
  return {
    day,
    clues: state.guesses.flatMap((id) => {
      const g = players.get(id);
      return g ? [compare(g, answer)] : [];
    }),
    guessesLeft: MYSTERY_GUESSES - state.guesses.length,
    solved: state.solved,
    finished: state.finished,
    answer: state.finished ? { name: answer.name, countryCode: answer.countryCode } : null,
  } satisfies MysteryView;
}

export async function getMystery(db: SupabaseClient, userId: string, day: string) {
  const answerId = await ensureMysteryDay(db, day);
  if (answerId == null) return null;
  return view(db, day, answerId, await loadAttempt(db, userId, day));
}

export async function guessMystery(
  db: SupabaseClient,
  userId: string,
  day: string,
  playerId: number,
): Promise<{ game: MysteryView; outcome: MysteryOutcome } | null> {
  const answerId = await ensureMysteryDay(db, day);
  if (answerId == null) return null;
  const before = await loadAttempt(db, userId, day);
  const { state, outcome } = applyMysteryGuess(before, answerId, playerId);
  if (state !== before) {
    check(
      await db.from("mystery_attempts").upsert(
        {
          user_id: userId,
          day,
          guesses: state.guesses,
          solved: state.solved,
          finished: state.finished,
        },
        { onConflict: "user_id,day" },
      ),
      "save attempt",
    );
  }
  return { game: await view(db, day, answerId, state), outcome };
}

export async function mysteryTable(db: SupabaseClient, day: string) {
  const { data } = await db
    .from("mystery_attempts")
    .select("user_id, guesses, solved, finished")
    .eq("day", day);
  return (
    (data ?? []) as { user_id: string; guesses: unknown[]; solved: boolean; finished: boolean }[]
  ).map((r) => ({
    userId: r.user_id,
    tries: r.guesses.length,
    solved: r.solved,
    finished: r.finished,
  }));
}
