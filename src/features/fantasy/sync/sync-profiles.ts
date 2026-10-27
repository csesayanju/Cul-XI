import "server-only";

import { ProviderError } from "@/lib/highlightly/client";
import {
  currentInjury,
  latestMarketValue,
  seasonLabel,
  seasonStatsFrom,
} from "@/lib/highlightly/mappers";

import type { Injury } from "../availability";
import {
  EMPTY_FORM,
  priceFor,
  type FantasyForm,
  type PlayerForm,
  type SeasonStats,
} from "../pricing";
import type { Position } from "../types";
import { check, DAY, HOUR, type SyncContext, type SyncResult } from "./context";

/** Max Highlightly requests per run. */
const MAX_REQUESTS = 20;
/** Never take the daily quota below this, so line-up/stats syncs always have room. */
const QUOTA_RESERVE = 30;
/** Injury reports for the next match's regulars: refreshed at most daily, from 3 days out. */
const INJURY_REFRESH = 20 * HOUR;
const MATCHDAY_WINDOW = 3 * DAY;
/** Market values change slowly. */
const VALUE_REFRESH = 30 * DAY;
/** Season stats: weekly is plenty for pricing. */
const SEASON_REFRESH = 7 * DAY;

interface PlayerRecord {
  id: number;
  api_player_id: number;
  team_api_id: number;
  position: Position;
  price_locked: boolean;
  form: Partial<PlayerForm> | null;
  last_match: PlayerForm | null;
  fantasy_form: FantasyForm | null;
  season_stats: SeasonStats | null;
  market_value: number | null;
  injury: Injury | null;
  market_value_checked_at: string | null;
  season_stats_checked_at: string | null;
}

type Task = {
  player: PlayerRecord;
  kind: "profile" | "season";
  priority: number;
  maxAgeMs: number;
};

const PLAYER_COLUMNS =
  "id, api_player_id, team_api_id, position, price_locked, form, last_match, fantasy_form, season_stats, market_value, injury, market_value_checked_at, season_stats_checked_at";

const age = (iso: string | null, now: Date) =>
  iso ? now.getTime() - Date.parse(iso) : Number.POSITIVE_INFINITY;

/**
 * Keeps player profiles fresh for upcoming matches and re-prices them:
 *  - profile (1 request): market value + current injury report;
 *  - season stats (1 request): current-season totals across competitions.
 * Priorities: injury checks for the next match's regulars (from 3 days out, daily) → missing
 * data (Barça first) → stale data. Budgeted per run and against the daily quota.
 */
export async function syncProfiles(
  ctx: SyncContext,
  { days = 10 }: { days?: number } = {},
): Promise<SyncResult> {
  const { db, api, config, now } = ctx;

  const matches = check(
    await db
      .from("matches")
      .select("id, kickoff_at")
      .gt("kickoff_at", now.toISOString())
      .lte("kickoff_at", new Date(now.getTime() + days * DAY).toISOString())
      .order("kickoff_at"),
    "load matches",
  ) as { id: number; kickoff_at: string }[];
  if (matches.length === 0) return { ok: true, message: "No upcoming matches in range." };

  const pool = check(
    await db
      .from("match_players")
      .select("match_id, player_id")
      .in(
        "match_id",
        matches.map((m) => m.id),
      ),
    "load match players",
  ) as { match_id: number; player_id: number }[];
  const ids = [...new Set(pool.map((p) => Number(p.player_id)))];
  if (ids.length === 0) return { ok: true, message: "No players in upcoming pools." };

  const next = matches[0]!;
  const matchdaySoon = Date.parse(next.kickoff_at) - now.getTime() <= MATCHDAY_WINDOW;
  const nextMatchIds = new Set(
    pool.filter((p) => Number(p.match_id) === Number(next.id)).map((p) => Number(p.player_id)),
  );

  const players = check(
    await db.from("players").select(PLAYER_COLUMNS).in("id", ids),
    "load players",
  ) as PlayerRecord[];

  // ---- Plan requests -------------------------------------------------------------------
  const tasks: Task[] = [];
  for (const p of players) {
    const isBarca = Number(p.team_api_id) === config.barcaTeamId;
    const regular = (p.form?.apps ?? 0) > 0 || p.injury != null;
    const profileAge = age(p.market_value_checked_at, now);
    if (matchdaySoon && nextMatchIds.has(Number(p.id)) && regular && profileAge > INJURY_REFRESH) {
      tasks.push({ player: p, kind: "profile", priority: 1, maxAgeMs: INJURY_REFRESH });
    } else if (profileAge === Number.POSITIVE_INFINITY) {
      tasks.push({
        player: p,
        kind: "profile",
        priority: isBarca ? 2 : 3,
        maxAgeMs: VALUE_REFRESH,
      });
    } else if (profileAge > VALUE_REFRESH) {
      tasks.push({ player: p, kind: "profile", priority: 5, maxAgeMs: VALUE_REFRESH });
    }
    const seasonAge = age(p.season_stats_checked_at, now);
    if (seasonAge === Number.POSITIVE_INFINITY) {
      tasks.push({
        player: p,
        kind: "season",
        priority: isBarca ? 2 : 4,
        maxAgeMs: SEASON_REFRESH,
      });
    } else if (seasonAge > SEASON_REFRESH) {
      tasks.push({ player: p, kind: "season", priority: 6, maxAgeMs: SEASON_REFRESH });
    }
  }
  tasks.sort(
    (a, b) =>
      a.priority - b.priority || (b.player.form?.starts ?? 0) - (a.player.form?.starts ?? 0),
  );

  // ---- Run within budget ---------------------------------------------------------------
  const season = seasonLabel(config.season);
  const touched = new Set<number>();
  let requests = 0;
  let done = 0;
  let injuriesFound = 0;
  let stoppedFor: string | null = null;

  for (const task of tasks) {
    if (requests >= MAX_REQUESTS) {
      stoppedFor = "per-run limit";
      break;
    }
    const remaining = api.getQuota().dailyRemaining;
    if (remaining != null && remaining <= QUOTA_RESERVE) {
      stoppedFor = `quota reserve (${remaining} left)`;
      break;
    }
    const p = task.player;
    try {
      if (task.kind === "profile") {
        const { data, fromCache } = await api.player(Number(p.api_player_id), {
          maxAgeMs: task.maxAgeMs,
          shouldCache: (d) => d.length > 0,
        });
        if (!fromCache) requests++;
        const injury = currentInjury(data[0]?.injuries, now);
        if (injury) injuriesFound++;
        p.market_value = latestMarketValue(data[0]?.marketValue);
        p.injury = injury;
        check(
          await db
            .from("players")
            .update({
              market_value: p.market_value,
              injury,
              market_value_checked_at: now.toISOString(),
            })
            .eq("id", p.id),
          "save profile",
        );
      } else {
        const { data, fromCache } = await api.playerStatistics(Number(p.api_player_id), {
          maxAgeMs: task.maxAgeMs,
          shouldCache: (d) => d.length > 0,
        });
        if (!fromCache) requests++;
        const stats = seasonStatsFrom(data[0]?.perCompetition, season);
        p.season_stats = stats ? { ...stats, teamGames: stats.games } : null;
        check(
          await db
            .from("players")
            .update({ season_stats: p.season_stats, season_stats_checked_at: now.toISOString() })
            .eq("id", p.id),
          "save season stats",
        );
      }
      done++;
      touched.add(Number(p.team_api_id));
    } catch (err) {
      if (err instanceof ProviderError && (err.kind === "quota" || err.kind === "rate_limit")) {
        stoppedFor = err.kind;
        break;
      }
      throw err;
    }
  }

  // ---- Re-price everyone on the teams we touched -----------------------------------------
  // teamGames ≈ the most games any squad-mate has played this season (for minutes share).
  const teamGames = new Map<number, number>();
  for (const p of players) {
    const team = Number(p.team_api_id);
    teamGames.set(team, Math.max(teamGames.get(team) ?? 0, p.season_stats?.games ?? 0));
  }
  let repriced = 0;
  for (const p of players) {
    if (p.price_locked || !touched.has(Number(p.team_api_id))) continue;
    const seasonStats = p.season_stats
      ? {
          ...p.season_stats,
          teamGames: teamGames.get(Number(p.team_api_id)) ?? p.season_stats.games,
        }
      : null;
    const price = priceFor(p.position, {
      form: { ...EMPTY_FORM, ...(p.form ?? {}) } as PlayerForm,
      last: p.last_match,
      fantasy: p.fantasy_form,
      season: seasonStats,
      marketValue: p.market_value == null ? null : Number(p.market_value),
    });
    check(
      await db.from("players").update({ price, season_stats: seasonStats }).eq("id", p.id),
      "save price",
    );
    repriced++;
  }

  const left = tasks.length - done;
  return {
    ok: true,
    message:
      `Players: ${done} updates (${requests} requests), ${injuriesFound} current injuries, ${repriced} re-priced` +
      (stoppedFor ? `; paused (${stoppedFor}), ${left} updates left for later runs.` : "."),
  };
}
