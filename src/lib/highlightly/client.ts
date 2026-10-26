import { createHash } from "node:crypto";

import type {
  HlBoxScoreTeam,
  HlLeague,
  HlLineups,
  HlMatch,
  HlMatchDetail,
  HlPage,
  HlPlayerDetail,
  HlPlayerStatistics,
  HlTeamRef,
} from "./types";

/**
 * The ONLY module that talks to the Highlightly Football API. It:
 *  - adds the auth header (the key is passed in by server code and never reaches the browser),
 *  - logs the remaining daily quota from response headers,
 *  - reads/writes a response cache so the same request is never paid for twice,
 *  - surfaces rate-limit and quota errors immediately — it never retries.
 */

export type ProviderErrorKind = "rate_limit" | "quota" | "auth" | "http" | "api" | "network";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface Quota {
  dailyLimit: number | null;
  dailyRemaining: number | null;
}

export interface CachedResponse {
  response: unknown;
  fetchedAt: Date;
}

/** Storage for cached API responses (Supabase `api_cache` in production, a Map in tests). */
export interface ApiCache {
  get(endpoint: string, paramsHash: string): Promise<CachedResponse | null>;
  set(
    endpoint: string,
    paramsHash: string,
    params: Record<string, string>,
    response: unknown,
  ): Promise<void>;
}

export type Params = Record<string, string | number | undefined>;

export interface RequestOptions<T> {
  /** Serve from cache if younger than this. `Infinity` = cache forever. Default: Infinity. */
  maxAgeMs?: number;
  /** Skip the cache read (still writes). Use sparingly — it costs a request. */
  force?: boolean;
  /** Only cache responses that pass this check (e.g. don't cache empty lineups). */
  shouldCache?: (data: T) => boolean;
}

export interface HighlightlyClientOptions {
  apiKey: string;
  baseUrl?: string;
  cache?: ApiCache;
  fetch?: typeof fetch;
  logger?: Pick<Console, "info" | "warn">;
  now?: () => Date;
}

const HEADER_DAILY_LIMIT = "x-ratelimit-requests-limit";
const HEADER_DAILY_REMAINING = "x-ratelimit-requests-remaining";

function toInt(value: string | null): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/** Normalises params (drops undefined, stringifies, sorts) so equal requests hash equally. */
export function normaliseParams(params: Params): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]): [string, string] => [k, String(v)])
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function hashParams(params: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 32);
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown };
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join("; ");
  } catch {
    // fall through
  }
  return `HTTP ${res.status}`;
}

export function createHighlightlyClient(options: HighlightlyClientOptions) {
  const {
    apiKey,
    baseUrl = "https://soccer.highlightly.net",
    cache,
    fetch: fetchImpl = globalThis.fetch,
    logger = console,
    now = () => new Date(),
  } = options;

  let quota: Quota = { dailyLimit: null, dailyRemaining: null };

  async function request<T>(
    endpoint: string,
    rawParams: Params = {},
    { maxAgeMs = Infinity, force = false, shouldCache }: RequestOptions<T> = {},
  ): Promise<{ data: T; fromCache: boolean }> {
    const params = normaliseParams(rawParams);
    const paramsHash = hashParams(params);

    if (cache && !force) {
      const hit = await cache.get(endpoint, paramsHash);
      if (hit && now().getTime() - hit.fetchedAt.getTime() <= maxAgeMs) {
        return { data: hit.response as T, fromCache: true };
      }
    }

    // Don't spend a request we already know will be refused.
    if (quota.dailyRemaining === 0) {
      throw new ProviderError("quota", "Highlightly daily quota exhausted; try again tomorrow.");
    }

    const url = new URL(endpoint.replace(/^\/?/, "/"), baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { "x-rapidapi-key": apiKey, accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      throw new ProviderError("network", `Could not reach Highlightly: ${String(err)}`);
    }

    quota = {
      dailyLimit: toInt(res.headers.get(HEADER_DAILY_LIMIT)) ?? quota.dailyLimit,
      dailyRemaining: toInt(res.headers.get(HEADER_DAILY_REMAINING)) ?? quota.dailyRemaining,
    };
    const log =
      quota.dailyRemaining != null && quota.dailyRemaining < 10 ? logger.warn : logger.info;
    log(
      `[highlightly] GET ${endpoint} -> ${res.status} | daily ${quota.dailyRemaining ?? "?"}/${quota.dailyLimit ?? "?"} left`,
    );

    if (res.status === 429) {
      const kind = quota.dailyRemaining === 0 ? "quota" : "rate_limit";
      throw new ProviderError(kind, `Highlightly ${kind.replace("_", " ")} hit (HTTP 429).`, 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(
        "auth",
        `Highlightly rejected the API key (HTTP ${res.status}): ${await errorMessage(res)}`,
        res.status,
      );
    }
    if (res.status >= 400 && res.status < 500) {
      throw new ProviderError("api", `Highlightly error: ${await errorMessage(res)}`, res.status);
    }
    if (!res.ok) {
      throw new ProviderError("http", `Highlightly HTTP ${res.status}`, res.status);
    }

    let body: T;
    try {
      body = (await res.json()) as T;
    } catch {
      throw new ProviderError("http", "Highlightly returned invalid JSON", res.status);
    }

    if (cache && (!shouldCache || shouldCache(body))) {
      await cache.set(endpoint, paramsHash, params, body);
    }
    return { data: body, fromCache: false };
  }

  return {
    request,
    getQuota: (): Quota => ({ ...quota }),

    /** All of a team's matches in a season. Highlightly has no "team" filter, so this is 2 requests (home + away). */
    async teamSeasonMatches(
      teamId: number,
      season: number,
      opts?: RequestOptions<HlPage<HlMatch>>,
    ) {
      const [home, away] = [
        await request<HlPage<HlMatch>>(
          "/matches",
          { homeTeamId: teamId, season, limit: 100 },
          opts,
        ),
        await request<HlPage<HlMatch>>(
          "/matches",
          { awayTeamId: teamId, season, limit: 100 },
          opts,
        ),
      ];
      return {
        data: [...home.data.data, ...away.data.data],
        fromCache: home.fromCache && away.fromCache,
      };
    },

    /** Match details incl. score, state and events. The API returns a one-item array. */
    match: (matchId: number, opts?: RequestOptions<HlMatchDetail[]>) =>
      request<HlMatchDetail[]>(`/matches/${matchId}`, {}, opts),

    /** Player profile (incl. market value history). The API returns a one-item array. */
    player: (playerId: number, opts?: RequestOptions<HlPlayerDetail[]>) =>
      request<HlPlayerDetail[]>(`/players/${playerId}`, {}, opts),

    /** Season-by-season stats per competition. The API returns a one-item array. */
    playerStatistics: (playerId: number, opts?: RequestOptions<HlPlayerStatistics[]>) =>
      request<HlPlayerStatistics[]>(`/players/${playerId}/statistics`, {}, opts),

    lastFiveGames: (teamId: number, opts?: RequestOptions<HlMatch[]>) =>
      request<HlMatch[]>("/last-five-games", { teamId }, opts),

    lineups: (matchId: number, opts?: RequestOptions<HlLineups>) =>
      request<HlLineups>(`/lineups/${matchId}`, {}, opts),

    boxScore: (matchId: number, opts?: RequestOptions<HlBoxScoreTeam[]>) =>
      request<HlBoxScoreTeam[]>(`/box-score/${matchId}`, {}, opts),

    searchTeams: (name: string, opts?: RequestOptions<HlPage<HlTeamRef>>) =>
      request<HlPage<HlTeamRef>>("/teams", { name, limit: 20 }, opts),

    leagues: (
      params: { countryCode?: string; leagueName?: string; season?: number },
      opts?: RequestOptions<HlPage<HlLeague>>,
    ) => request<HlPage<HlLeague>>("/leagues", { ...params, limit: 100 }, opts),
  };
}

export type HighlightlyClient = ReturnType<typeof createHighlightlyClient>;
