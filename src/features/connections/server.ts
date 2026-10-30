import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cachedCategories, fameOrder } from "@/features/tiki-taka-toe/server";

import {
  applyConnectionsGuess,
  buildConnections,
  MAX_MISTAKES,
  NEW_CONNECTIONS,
  type ConnectionsOutcome,
  type ConnectionsPuzzle,
  type ConnectionsState,
  type GroupCandidate,
} from "./game";

/** The day's groups are the answers: everything here uses the service-role client. */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

export async function ensureConnectionsDay(
  db: SupabaseClient,
  day: string,
): Promise<ConnectionsPuzzle | null> {
  const { data } = await db.from("connections_daily").select("puzzle").eq("day", day).maybeSingle();
  if (data) return data.puzzle as ConnectionsPuzzle;

  const [{ cats, sets }, fame] = await Promise.all([cachedCategories(db), fameOrder(db)]);
  // Positions are too broad to be a fun group; everything else can be one.
  const candidates: GroupCandidate[] = cats
    .filter((c) => c.type !== "position")
    .map((c) => ({
      label:
        c.type === "club"
          ? `Played for ${c.label}`
          : c.type === "nation"
            ? `From ${c.label}`
            : c.label,
      ids: sets.get(`${c.type}:${c.key}`) ?? [],
    }));
  const puzzle = buildConnections(candidates, `conn:${day}`, fame.rank);
  if (!puzzle) return null;
  await db
    .from("connections_daily")
    .upsert({ day, puzzle }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db
    .from("connections_daily")
    .select("puzzle")
    .eq("day", day)
    .single();
  return (saved?.puzzle as ConnectionsPuzzle) ?? puzzle;
}

export interface ConnectionsView {
  day: string;
  /** Players still to place, in the shown order. */
  tiles: { id: number; name: string; countryCode: string | null }[];
  /** Groups found (or all of them once the game is over), in the order found. */
  groups: { index: number; label: string; players: string[]; found: boolean }[];
  mistakesLeft: number;
  finished: boolean;
}

async function loadAttempt(
  db: SupabaseClient,
  userId: string,
  day: string,
): Promise<ConnectionsState> {
  const { data } = await db
    .from("connections_attempts")
    .select("solved, mistakes, finished")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data
    ? {
        solved: (data.solved as number[]).map(Number),
        mistakes: data.mistakes,
        finished: data.finished,
      }
    : NEW_CONNECTIONS;
}

async function view(
  db: SupabaseClient,
  day: string,
  puzzle: ConnectionsPuzzle,
  state: ConnectionsState,
): Promise<ConnectionsView> {
  const { data } = await db
    .from("trivia_players")
    .select("id, name, country_code")
    .in("id", puzzle.order);
  const byId = new Map((data ?? []).map((p) => [Number(p.id), p]));
  const name = (id: number) => (byId.get(id)?.name as string) ?? "?";
  const shown = state.finished
    ? [...state.solved, ...puzzle.groups.map((_, i) => i).filter((i) => !state.solved.includes(i))]
    : state.solved;
  const placed = new Set(shown.flatMap((i) => puzzle.groups[i]!.ids));
  return {
    day,
    tiles: puzzle.order
      .filter((id) => !placed.has(id))
      .map((id) => ({
        id,
        name: name(id),
        countryCode: (byId.get(id)?.country_code as string) ?? null,
      })),
    groups: shown.map((i) => ({
      index: i,
      label: puzzle.groups[i]!.label,
      players: puzzle.groups[i]!.ids.map(name),
      found: state.solved.includes(i),
    })),
    mistakesLeft: MAX_MISTAKES - state.mistakes,
    finished: state.finished,
  };
}

export async function getConnections(db: SupabaseClient, userId: string, day: string) {
  const puzzle = await ensureConnectionsDay(db, day);
  if (!puzzle) return null;
  return view(db, day, puzzle, await loadAttempt(db, userId, day));
}

export async function guessConnections(
  db: SupabaseClient,
  userId: string,
  day: string,
  pick: number[],
): Promise<{ game: ConnectionsView; outcome: ConnectionsOutcome } | null> {
  const puzzle = await ensureConnectionsDay(db, day);
  if (!puzzle) return null;
  const before = await loadAttempt(db, userId, day);
  const { state, outcome } = applyConnectionsGuess(puzzle, before, pick);
  if (state !== before) {
    check(
      await db.from("connections_attempts").upsert(
        {
          user_id: userId,
          day,
          solved: state.solved,
          mistakes: state.mistakes,
          finished: state.finished,
        },
        { onConflict: "user_id,day" },
      ),
      "save attempt",
    );
  }
  return { game: await view(db, day, puzzle, state), outcome };
}

export async function connectionsTable(db: SupabaseClient, day: string) {
  const { data } = await db
    .from("connections_attempts")
    .select("user_id, solved, mistakes, finished")
    .eq("day", day);
  return (
    (data ?? []) as { user_id: string; solved: unknown[]; mistakes: number; finished: boolean }[]
  ).map((r) => ({
    userId: r.user_id,
    groups: r.solved.length,
    mistakes: r.mistakes,
    finished: r.finished,
  }));
}
