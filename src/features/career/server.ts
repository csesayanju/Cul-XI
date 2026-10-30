import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CLUB_NAMES } from "@/features/tiki-taka-toe/grid";
import { commonsThumb } from "@/lib/wikidata/careers";

import {
  applyCareerGuess,
  CAREER_GUESSES,
  daySeed,
  NEW_CAREER,
  pickCareerPlayer,
  unlockedHints,
  type CareerHints,
  type CareerOutcome,
  type CareerState,
} from "./career";
import { NO_LOGO } from "./import";

/** The day's player is the answer: everything here uses the service-role client. */

/** "Manchester United F.C." -> "Manchester United", "Al Hilal SFC" -> "Al Hilal". */
const tidyClub = (name: string) =>
  name.replace(/\s+(F\.?C\.?|C\.?F\.?|S\.?F\.?C\.?|S\.?C\.?|A\.?F\.?C\.?)$/i, "").trim() || name;

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** Candidates: the 400 most famous players with a fair career; no repeat within 90 days. */
const POOL = 400;
const MIN_FAME = 45;
const GAP_DAYS = 90;

export async function ensureCareerDay(db: SupabaseClient, day: string): Promise<number | null> {
  const { data } = await db.from("career_daily").select("player_id").eq("day", day).maybeSingle();
  if (data) return Number(data.player_id);

  const { data: rows, error } = await db.rpc("career_candidates", {
    min_fame: MIN_FAME,
    max_rows: POOL,
  });
  if (error) throw new Error(`career candidates: ${error.message}`);
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - GAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: recent } = await db.from("career_daily").select("player_id").gte("day", since);
  const pick = pickCareerPlayer(
    ((rows ?? []) as { player_id: number }[]).map((r) => Number(r.player_id)),
    new Set((recent ?? []).map((r) => Number(r.player_id))),
    daySeed(day),
  );
  if (pick == null) return null;
  await db
    .from("career_daily")
    .upsert({ day, player_id: pick }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db.from("career_daily").select("player_id").eq("day", day).single();
  return saved ? Number(saved.player_id) : pick;
}

export interface CareerSpellView {
  club: string;
  logo: string | null;
  from: number | null;
  to: number | null;
}

export interface CareerView {
  day: string;
  spells: CareerSpellView[];
  hints: CareerHints;
  guesses: { id: number; name: string; countryCode: string | null }[];
  guessesLeft: number;
  solved: boolean;
  finished: boolean;
  /** Only once the game is over. */
  answer: { name: string; countryCode: string | null } | null;
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<CareerState> {
  const { data } = await db
    .from("career_attempts")
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
    : NEW_CAREER;
}

async function view(
  db: SupabaseClient,
  day: string,
  answerId: number,
  state: CareerState,
): Promise<CareerView> {
  const [{ data: player }, { data: spells }, { data: guessed }] = await Promise.all([
    db
      .from("trivia_players")
      .select("name, nationality, country_code, position, birth_year")
      .eq("id", answerId)
      .single(),
    db
      .from("trivia_careers")
      .select("seq, from_year, to_year, trivia_clubs(qid, name, short_name, logo_file, logo_url)")
      .eq("player_id", answerId)
      .order("seq"),
    state.guesses.length
      ? db.from("trivia_players").select("id, name, country_code").in("id", state.guesses)
      : Promise.resolve({
          data: [] as { id: number; name: string; country_code: string | null }[],
        }),
  ]);
  if (!player) throw new Error("Career Path: today's player is missing.");
  const byId = new Map((guessed ?? []).map((g) => [Number(g.id), g]));
  const wrong = state.guesses.filter((g) => g !== answerId).length;

  return {
    day,
    spells: (
      (spells ?? []) as unknown as {
        from_year: number | null;
        to_year: number | null;
        trivia_clubs: {
          qid: string;
          name: string;
          short_name: string | null;
          logo_file: string | null;
          logo_url: string | null;
        } | null;
      }[]
    ).map((s) => {
      const c = s.trivia_clubs;
      return {
        club: c ? (c.short_name ?? CLUB_NAMES[c.name] ?? tidyClub(c.name)) : "?",
        logo:
          !c || NO_LOGO.has(c.qid) ? null : c.logo_file ? commonsThumb(c.logo_file) : c.logo_url,
        from: s.from_year,
        to: s.to_year,
      };
    }),
    hints: unlockedHints(wrong, state.finished, {
      name: player.name as string,
      nationality: player.nationality as string | null,
      countryCode: player.country_code as string | null,
      position: player.position as string | null,
      birthYear: player.birth_year as number | null,
    }),
    guesses: state.guesses.map((id) => ({
      id,
      name: (byId.get(id)?.name as string) ?? "?",
      countryCode: (byId.get(id)?.country_code as string | null) ?? null,
    })),
    guessesLeft: CAREER_GUESSES - state.guesses.length,
    solved: state.solved,
    finished: state.finished,
    answer: state.finished
      ? { name: player.name as string, countryCode: player.country_code as string | null }
      : null,
  };
}

export async function getCareer(db: SupabaseClient, userId: string, day: string) {
  const answerId = await ensureCareerDay(db, day);
  if (answerId == null) return null;
  return view(db, day, answerId, await loadAttempt(db, userId, day));
}

export async function guessCareer(
  db: SupabaseClient,
  userId: string,
  day: string,
  playerId: number,
): Promise<{ game: CareerView; outcome: CareerOutcome } | null> {
  const answerId = await ensureCareerDay(db, day);
  if (answerId == null) return null;
  const before = await loadAttempt(db, userId, day);
  const { state, outcome } = applyCareerGuess(before, answerId, playerId);
  if (state !== before) {
    check(
      await db.from("career_attempts").upsert(
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

/** Today's results for the user's league-mates (RLS limits rows). */
export async function careerTable(db: SupabaseClient, day: string) {
  const { data } = await db
    .from("career_attempts")
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
