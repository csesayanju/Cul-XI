import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { daySeed } from "@/features/career/career";

import {
  applySeasonGuess,
  guessHints,
  NEW_SEASON_GAME,
  pickSeason,
  SEASON_GAP_DAYS,
  SEASON_GUESSES,
  seasonLabel,
  unlockedClues,
  type Clue,
  type SeasonFacts,
  type SeasonOutcome,
  type SeasonState,
} from "./season";

/** The day's season is the answer: everything here uses the service-role client. */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

/** Seasons that can be guessed (finished ones), oldest first. */
async function completeSeasons(db: SupabaseClient): Promise<number[]> {
  const rows = check(
    await db.from("barca_seasons").select("start_year").eq("complete", true).order("start_year"),
    "load seasons",
  ) as { start_year: number }[];
  return rows.map((r) => Number(r.start_year));
}

export async function ensureSeasonDay(db: SupabaseClient, day: string): Promise<number | null> {
  const { data } = await db.from("season_daily").select("start_year").eq("day", day).maybeSingle();
  if (data) return Number(data.start_year);

  const since = new Date(Date.parse(`${day}T00:00:00Z`) - SEASON_GAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [seasons, { data: recent }] = await Promise.all([
    completeSeasons(db),
    db.from("season_daily").select("start_year").gte("day", since),
  ]);
  const pick = pickSeason(
    seasons,
    new Set((recent ?? []).map((r) => Number(r.start_year))),
    daySeed(`season:${day}`),
  );
  if (pick == null) return null;
  // Two first visits at once: the unique day keeps one pick, and both read it back.
  await db
    .from("season_daily")
    .upsert({ day, start_year: pick }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db
    .from("season_daily")
    .select("start_year")
    .eq("day", day)
    .single();
  return saved ? Number(saved.start_year) : pick;
}

export interface ClasicoView {
  competition: string;
  round: string | null;
  date: string | null;
  home: string;
  away: string;
  score: string;
}

export interface SeasonView {
  day: string;
  clues: Clue[];
  totalClues: number;
  guesses: ReturnType<typeof guessHints>;
  guessesLeft: number;
  solved: boolean;
  finished: boolean;
  /** Seasons that can be guessed (start years). */
  choices: number[];
  /** Only once the game is over. */
  answer: { startYear: number; season: string; clasicos: ClasicoView[] } | null;
}

async function loadFacts(db: SupabaseClient, startYear: number): Promise<SeasonFacts> {
  const [{ data: s }, { data: liga }] = await Promise.all([
    db.from("barca_seasons").select("*").eq("start_year", startYear).single(),
    db
      .from("liga_seasons")
      .select("champion, top_scorers, top_scorer_clubs, top_scorer_goals")
      .eq("start_year", startYear)
      .maybeSingle(),
  ]);
  if (!s) throw new Error("Which Season?: today's season is missing.");
  return {
    startYear,
    season: s.season,
    played: s.played,
    won: s.won,
    drawn: s.drawn,
    lost: s.lost,
    goalsFor: s.goals_for,
    goalsAgainst: s.goals_against,
    points: s.points,
    position: s.position,
    copa: s.copa,
    europe: s.europe,
    topScorers: s.top_scorers ?? [],
    topScorerGoals: s.top_scorer_goals,
    champion: liga?.champion ?? null,
    pichichi: liga
      ? {
          names: liga.top_scorers ?? [],
          clubs: liga.top_scorer_clubs ?? [],
          goals: liga.top_scorer_goals,
        }
      : null,
  };
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<SeasonState> {
  const { data } = await db
    .from("season_attempts")
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
    : NEW_SEASON_GAME;
}

async function clasicosOf(db: SupabaseClient, startYear: number): Promise<ClasicoView[]> {
  const { data } = await db
    .from("clasicos")
    .select("competition, round, played_on, home, home_goals, away_goals, note")
    .eq("start_year", startYear)
    .order("played_on", { ascending: true, nullsFirst: false });
  return (data ?? []).map((c) => ({
    competition: c.competition,
    round: c.round,
    date: c.played_on,
    home: c.home,
    away: c.home === "Barcelona" ? "Real Madrid" : "Barcelona",
    score: `${c.home_goals}–${c.away_goals}${c.note ? ` (${c.note})` : ""}`,
  }));
}

async function view(
  db: SupabaseClient,
  day: string,
  facts: SeasonFacts,
  choices: number[],
  state: SeasonState,
): Promise<SeasonView> {
  return {
    day,
    clues: unlockedClues(facts, state),
    totalClues: 6,
    // Earlier/later per guess is the game's feedback; the answer itself stays hidden.
    guesses: guessHints(state.guesses, facts.startYear),
    guessesLeft: SEASON_GUESSES - state.guesses.length,
    solved: state.solved,
    finished: state.finished,
    choices,
    answer: state.finished
      ? {
          startYear: facts.startYear,
          season: seasonLabel(facts.startYear),
          clasicos: await clasicosOf(db, facts.startYear),
        }
      : null,
  };
}

export async function getSeasonGame(db: SupabaseClient, userId: string, day: string) {
  const answer = await ensureSeasonDay(db, day);
  if (answer == null) return null;
  const [facts, choices, state] = await Promise.all([
    loadFacts(db, answer),
    completeSeasons(db),
    loadAttempt(db, userId, day),
  ]);
  return view(db, day, facts, choices, state);
}

export async function guessSeason(
  db: SupabaseClient,
  userId: string,
  day: string,
  startYear: number,
): Promise<{ game: SeasonView; outcome: SeasonOutcome } | null> {
  const answer = await ensureSeasonDay(db, day);
  if (answer == null) return null;
  const [facts, choices, before] = await Promise.all([
    loadFacts(db, answer),
    completeSeasons(db),
    loadAttempt(db, userId, day),
  ]);
  const { state, outcome } = applySeasonGuess(before, answer, startYear, new Set(choices));
  if (state !== before) {
    check(
      await db.from("season_attempts").upsert(
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
  return { game: await view(db, day, facts, choices, state), outcome };
}
