import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EMPTY_FORM, type PlayerForm } from "./pricing";
import type { Competition, Position } from "./types";

/** Read helpers used by pages. They run with the user's client, so RLS applies. */

export interface MatchSummary {
  id: number;
  competition: Competition;
  opponent_name: string;
  opponent_team_id: number;
  is_home: boolean;
  venue: string | null;
  kickoff_at: string;
  status: string;
  barca_goals: number | null;
  opponent_goals: number | null;
  points_calculated_at: string | null;
}

const MATCH_FIELDS =
  "id, competition, opponent_name, opponent_team_id, is_home, venue, kickoff_at, status, barca_goals, opponent_goals, points_calculated_at";

export async function listMatches(db: SupabaseClient, now = new Date()) {
  const recentCutoff = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const [upcoming, recent] = await Promise.all([
    db
      .from("matches")
      .select(MATCH_FIELDS)
      .gt("kickoff_at", recentCutoff)
      .order("kickoff_at", { ascending: true })
      .limit(10),
    db
      .from("matches")
      .select(MATCH_FIELDS)
      .lte("kickoff_at", recentCutoff)
      .order("kickoff_at", { ascending: false })
      .limit(10),
  ]);
  return {
    upcoming: (upcoming.data ?? []) as MatchSummary[],
    recent: (recent.data ?? []) as MatchSummary[],
  };
}

export async function getMatch(db: SupabaseClient, id: number) {
  const { data } = await db.from("matches").select(MATCH_FIELDS).eq("id", id).maybeSingle();
  return data as MatchSummary | null;
}

export interface MatchPlayer {
  id: number;
  name: string;
  position: Position;
  teamId: number;
  teamName: string;
  price: number;
  shirtNumber: number | null;
  lineupStatus: "unknown" | "starting" | "bench" | "not_in_squad";
  photoUrl: string | null;
  /** Attribution for the photo (author · licence) and its Wikimedia Commons page. */
  photoCredit: string | null;
  photoPageUrl: string | null;
  photoLocked: boolean;
  form: PlayerForm | null;
  priceLocked: boolean;
}

export async function listMatchPlayers(
  db: SupabaseClient,
  matchId: number,
): Promise<MatchPlayer[]> {
  const { data } = await db
    .from("match_players")
    .select(
      "lineup_status, players(id, name, position, team_api_id, team_name, price, shirt_number, photo_url, photo_credit, photo_page_url, photo_locked, form, price_locked)",
    )
    .eq("match_id", matchId)
    .eq("is_available", true);

  type Row = {
    lineup_status: MatchPlayer["lineupStatus"];
    players: {
      id: number;
      name: string;
      position: Position;
      team_api_id: number;
      team_name: string;
      price: number;
      shirt_number: number | null;
      photo_url: string | null;
      photo_credit: string | null;
      photo_page_url: string | null;
      photo_locked: boolean;
      form: Partial<PlayerForm> | null;
      price_locked: boolean;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.players)
    .map(({ lineup_status, players: p }) => ({
      id: Number(p!.id),
      name: p!.name,
      position: p!.position,
      teamId: Number(p!.team_api_id),
      teamName: p!.team_name,
      price: Number(p!.price),
      shirtNumber: p!.shirt_number,
      lineupStatus: lineup_status,
      photoUrl: p!.photo_url,
      photoCredit: p!.photo_credit,
      photoPageUrl: p!.photo_page_url,
      photoLocked: p!.photo_locked,
      form:
        typeof p!.form?.matches === "number" ? ({ ...EMPTY_FORM, ...p!.form } as PlayerForm) : null,
      priceLocked: p!.price_locked,
    }))
    .sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
}

export interface MyTeam {
  id: string;
  locked: boolean;
  picks: { playerId: number; isCaptain: boolean; isViceCaptain: boolean }[];
}

export async function getMyTeam(
  db: SupabaseClient,
  userId: string,
  matchId: number,
): Promise<MyTeam | null> {
  const { data } = await db
    .from("fantasy_teams")
    .select("id, locked, fantasy_team_players(player_id, is_captain, is_vice_captain)")
    .eq("user_id", userId)
    .eq("match_id", matchId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    locked: boolean;
    fantasy_team_players: { player_id: number; is_captain: boolean; is_vice_captain: boolean }[];
  };
  return {
    id: row.id,
    locked: row.locked,
    picks: row.fantasy_team_players.map((p) => ({
      playerId: Number(p.player_id),
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    })),
  };
}

/** The user's first league and its members (id -> display name). */
export async function getMyLeague(db: SupabaseClient, userId: string) {
  const { data: membership } = await db
    .from("league_members")
    .select("league_id, leagues(name)")
    .eq("user_id", userId)
    .order("joined_at")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const m = membership as unknown as { league_id: string; leagues: { name: string } | null };
  const { data: members } = await db
    .from("league_members")
    .select("user_id, profiles(display_name)")
    .eq("league_id", m.league_id);

  const names = new Map<string, string>();
  for (const row of (members ?? []) as unknown as {
    user_id: string;
    profiles: { display_name: string } | null;
  }[]) {
    names.set(row.user_id, row.profiles?.display_name ?? "Unknown");
  }
  return { id: m.league_id, name: m.leagues?.name ?? "League", members: names };
}
