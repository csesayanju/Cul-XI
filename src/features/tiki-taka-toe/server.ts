import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { fetchPlayerClubs } from "@/lib/wikidata/barca-players";

import {
  applyTtt,
  buildGrid,
  categories,
  matches,
  NEW_TTT,
  rarityScore,
  type Category,
  type Grid,
  type GridPlayer,
  type TttOutcome,
  type TttState,
} from "./grid";

/** All reads of the grid and all writes use the service-role client (example answers). */

const check = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---------------------------------------------------------------------------------------
// Import (one-time, re-runnable)
// ---------------------------------------------------------------------------------------

/** Stores the other clubs every repository player played for (Wikidata, a few seconds). */
export async function importClubs(db: SupabaseClient) {
  const links = await fetchPlayerClubs();
  const repo = await fetchAll<{ id: number; wikidata_id: string | null }>(
    db,
    "trivia_players",
    "id, wikidata_id",
    "load repository",
  );
  const byQid = new Map(
    repo.filter((r) => r.wikidata_id).map((r) => [r.wikidata_id!, Number(r.id)]),
  );

  const clubs = new Map(links.map((l) => [l.clubId, l.clubName]));
  const clubRows = [...clubs].map(([qid, name]) => ({ qid, name }));
  for (let i = 0; i < clubRows.length; i += 1000) {
    check(
      await db.from("trivia_clubs").upsert(clubRows.slice(i, i + 1000), { onConflict: "qid" }),
      "save clubs",
    );
  }
  const linkRows = links
    .filter((l) => byQid.has(l.playerId))
    .map((l) => ({ player_id: byQid.get(l.playerId)!, club_qid: l.clubId }));
  for (let i = 0; i < linkRows.length; i += 1000) {
    check(
      await db.from("trivia_player_clubs").upsert(linkRows.slice(i, i + 1000), {
        onConflict: "player_id,club_qid",
        ignoreDuplicates: true,
      }),
      "save player clubs",
    );
  }
  return { clubs: clubRows.length, links: linkRows.length };
}

// ---------------------------------------------------------------------------------------
// The daily grid
// ---------------------------------------------------------------------------------------

export async function loadPlayers(db: SupabaseClient) {
  const [players, links, clubs] = await Promise.all([
    fetchAll<{
      id: number;
      name: string;
      country_code: string | null;
      nationality: string | null;
      position: string | null;
      barca_from: number | null;
      barca_to: number | null;
      wd_apps: number | null;
      roles: string[] | null;
    }>(
      db,
      "trivia_players",
      "id, name, country_code, nationality, position, barca_from, barca_to, wd_apps, roles",
      "load players",
    ),
    fetchAll<{ player_id: number; club_qid: string }>(
      db,
      "trivia_player_clubs",
      "player_id, club_qid",
      "load player clubs",
      ["player_id", "club_qid"],
    ),
    fetchAll<{ qid: string; name: string }>(db, "trivia_clubs", "qid, name", "load clubs", "qid"),
  ]);
  const clubsOf = new Map<number, Set<string>>();
  for (const l of links) {
    const id = Number(l.player_id);
    clubsOf.set(id, (clubsOf.get(id) ?? new Set()).add(l.club_qid));
  }
  const gridPlayers: GridPlayer[] = players
    .filter((p) => (p.roles ?? ["player"]).includes("player"))
    .map((p) => ({
      id: Number(p.id),
      name: p.name,
      countryCode: p.country_code,
      nationality: p.nationality,
      position: p.position,
      from: p.barca_from,
      to: p.barca_to,
      apps: p.wd_apps,
      clubs: clubsOf.get(Number(p.id)) ?? new Set(),
    }));
  return { players: gridPlayers, clubNames: new Map(clubs.map((c) => [c.qid, c.name])) };
}

/** Today's grid, generated (deterministically from the day) and frozen on first request. */
export async function ensureGrid(db: SupabaseClient, day: string): Promise<Grid | null> {
  const { data } = await db.from("ttt_daily").select("grid").eq("day", day).maybeSingle();
  if (data) return data.grid as Grid;

  const { players, clubNames } = await loadPlayers(db);
  const grid = buildGrid(players, categories(players, clubNames), `ttt:${day}`);
  if (!grid) return null;
  await db.from("ttt_daily").upsert({ day, grid }, { onConflict: "day", ignoreDuplicates: true });
  const { data: saved } = await db.from("ttt_daily").select("grid").eq("day", day).single();
  return (saved?.grid as Grid) ?? grid;
}

/** Does this player fit the cell? Checks one player against the cell's two categories. */
async function fits(db: SupabaseClient, playerId: number, row: Category, col: Category) {
  const [{ data: p }, { data: clubs }] = await Promise.all([
    db
      .from("trivia_players")
      .select("id, name, country_code, nationality, position, barca_from, barca_to, wd_apps")
      .eq("id", playerId)
      .maybeSingle(),
    db.from("trivia_player_clubs").select("club_qid").eq("player_id", playerId),
  ]);
  if (!p) return false;
  const player: GridPlayer = {
    id: Number(p.id),
    name: p.name as string,
    countryCode: p.country_code as string | null,
    nationality: p.nationality as string | null,
    position: p.position as string | null,
    from: p.barca_from as number | null,
    to: p.barca_to as number | null,
    apps: p.wd_apps as number | null,
    clubs: new Set((clubs ?? []).map((c) => c.club_qid as string)),
  };
  return matches(player, row) && matches(player, col);
}

// ---------------------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------------------

export interface CellView {
  player: { id: number; name: string; countryCode: string | null } | null;
  /** % of today's players who put the same answer here (once filled). */
  percent: number | null;
  /** How many answers exist (shown once the game is over). */
  answers: number | null;
  /** Well-known answers for an empty cell, shown once the game is over. */
  examples: string[];
}

export interface TttView {
  day: string;
  rows: Category[];
  cols: Category[];
  cells: CellView[];
  guessesLeft: number;
  filled: number;
  finished: boolean;
  rarity: number | null;
  players: number;
}

async function loadAttempt(db: SupabaseClient, userId: string, day: string): Promise<TttState> {
  const { data } = await db
    .from("ttt_attempts")
    .select("cells, guesses_left, finished")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  return data
    ? {
        cells: data.cells as (number | null)[],
        guessesLeft: data.guesses_left,
        finished: data.finished,
      }
    : NEW_TTT;
}

async function view(
  db: SupabaseClient,
  day: string,
  grid: Grid,
  state: TttState,
): Promise<TttView> {
  const exampleIds = state.finished ? grid.answers.flatMap((a) => a.examples) : [];
  const ids = [...new Set([...state.cells.filter((c): c is number => c != null), ...exampleIds])];
  const [{ data: people }, { data: all }] = await Promise.all([
    ids.length
      ? db.from("trivia_players").select("id, name, country_code").in("id", ids)
      : Promise.resolve({
          data: [] as { id: number; name: string; country_code: string | null }[],
        }),
    db.from("ttt_attempts").select("cells").eq("day", day),
  ]);
  const byId = new Map((people ?? []).map((p) => [Number(p.id), p]));

  // Pick rates per cell among everyone who has played today.
  const attempts = (all ?? []) as { cells: (number | null)[] }[];
  const percents = state.cells.map((c, i) => {
    if (c == null || attempts.length === 0) return null;
    const same = attempts.filter((a) => a.cells[i] === c).length;
    return Math.round((same / attempts.length) * 1000) / 10;
  });

  const cells: CellView[] = state.cells.map((c, i) => {
    const p = c != null ? byId.get(c) : undefined;
    return {
      player: p
        ? { id: Number(p.id), name: p.name as string, countryCode: p.country_code as string | null }
        : null,
      percent: percents[i] ?? null,
      answers: state.finished ? grid.answers[i]!.count : null,
      examples:
        state.finished && c == null
          ? grid.answers[i]!.examples.map((id) => (byId.get(id)?.name as string) ?? "").filter(
              Boolean,
            )
          : [],
    };
  });
  const filled = state.cells.filter((c) => c != null).length;
  return {
    day,
    rows: grid.rows,
    cols: grid.cols,
    cells,
    guessesLeft: state.guessesLeft,
    filled,
    finished: state.finished,
    rarity: filled > 0 || state.finished ? rarityScore(state.cells, percents) : null,
    players: attempts.length,
  };
}

export async function getTtt(db: SupabaseClient, userId: string, day: string) {
  const grid = await ensureGrid(db, day);
  if (!grid) return null;
  return view(db, day, grid, await loadAttempt(db, userId, day));
}

export async function guessTtt(
  db: SupabaseClient,
  userId: string,
  day: string,
  cell: number,
  playerId: number,
): Promise<{ game: TttView; outcome: TttOutcome } | null> {
  const grid = await ensureGrid(db, day);
  if (!grid) return null;
  const before = await loadAttempt(db, userId, day);
  const row = grid.rows[Math.floor(cell / 3)]!;
  const col = grid.cols[cell % 3]!;
  const ok =
    !before.finished && before.cells[cell] == null && !before.cells.includes(playerId)
      ? await fits(db, playerId, row, col)
      : false;
  const { state, outcome } = applyTtt(before, cell, playerId, ok);
  if (state !== before) {
    check(
      await db.from("ttt_attempts").upsert(
        {
          user_id: userId,
          day,
          cells: state.cells,
          filled: state.cells.filter((c) => c != null).length,
          guesses_left: state.guessesLeft,
          finished: state.finished,
        },
        { onConflict: "user_id,day" },
      ),
      "save attempt",
    );
  }
  return { game: await view(db, day, grid, state), outcome };
}

/** Today's results for the user's league-mates (RLS limits rows). */
export async function tttTable(db: SupabaseClient, day: string) {
  const { data } = await db
    .from("ttt_attempts")
    .select("user_id, filled, guesses_left, finished")
    .eq("day", day);
  return (data ?? []) as {
    user_id: string;
    filled: number;
    guesses_left: number;
    finished: boolean;
  }[];
}
