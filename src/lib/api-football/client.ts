import { createHash } from "node:crypto";

import type {
  ApiFixture,
  ApiFixturePlayers,
  ApiFootballEnvelope,
  ApiLineup,
  ApiSquad,
  ApiStatus,
} from "./types";

/**
 * The ONLY module that talks to API-Football. It:
 *  - adds the auth header (the key is passed in by server code and never reaches the browser),
 *  - logs the remaining daily/minute quota from response headers,
 *  - reads/writes a response cache so the same request is never paid for twice,
 *  - surfaces rate-limit and quota errors immediately — it never retries.
 */

export type ApiFootballErrorKind = "rate_limit" | "quota" | "auth" | "http" | "api" | "network";

export class ApiFootballError extends Error {
  constructor(
    readonly kind: ApiFootballErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiFootballError";
  }
}

export interface Quota {
  dailyLimit: number | null;
  dailyRemaining: number | null;
  minuteLimit: number | null;
  minuteRemaining: number | null;
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

export interface ApiFootballClientOptions {
  apiKey: string;
  baseUrl?: string;
  cache?: ApiCache;
  fetch?: typeof fetch;
  logger?: Pick<Console, "info" | "warn">;
  now?: () => Date;
}

const HEADER_DAILY_LIMIT = "x-ratelimit-requests-limit";
const HEADER_DAILY_REMAINING = "x-ratelimit-requests-remaining";
const HEADER_MINUTE_LIMIT = "x-ratelimit-limit";
const HEADER_MINUTE_REMAINING = "x-ratelimit-remaining";

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

function classifyApiErrors(
  errors: ApiFootballEnvelope<unknown>["errors"],
): ApiFootballError | null {
  const entries = Array.isArray(errors)
    ? errors.map((e, i) => [String(i), e] as const)
    : Object.entries(errors ?? {});
  if (entries.length === 0) return null;

  const message = entries.map(([k, v]) => `${k}: ${v}`).join("; ");
  const keys = entries.map(([k]) => k.toLowerCase());
  const text = message.toLowerCase();
  if (keys.includes("ratelimit") || text.includes("too many requests")) {
    return new ApiFootballError("rate_limit", `API-Football rate limit: ${message}`);
  }
  if (keys.includes("requests") || text.includes("request limit")) {
    return new ApiFootballError("quota", `API-Football daily quota reached: ${message}`);
  }
  if (keys.includes("token") || text.includes("key")) {
    return new ApiFootballError("auth", `API-Football rejected the API key: ${message}`);
  }
  return new ApiFootballError("api", `API-Football error: ${message}`);
}

export function createApiFootballClient(options: ApiFootballClientOptions) {
  const {
    apiKey,
    baseUrl = "https://v3.football.api-sports.io",
    cache,
    fetch: fetchImpl = globalThis.fetch,
    logger = console,
    now = () => new Date(),
  } = options;

  let quota: Quota = {
    dailyLimit: null,
    dailyRemaining: null,
    minuteLimit: null,
    minuteRemaining: null,
  };

  async function request<T>(
    endpoint: string,
    rawParams: Params = {},
    { maxAgeMs = Infinity, force = false, shouldCache }: RequestOptions<T> = {},
  ): Promise<{ data: T; fromCache: boolean; results: number }> {
    const params = normaliseParams(rawParams);
    const paramsHash = hashParams(params);

    if (cache && !force) {
      const hit = await cache.get(endpoint, paramsHash);
      if (hit && now().getTime() - hit.fetchedAt.getTime() <= maxAgeMs) {
        const env = hit.response as ApiFootballEnvelope<T>;
        return { data: env.response, fromCache: true, results: env.results };
      }
    }

    // Don't spend a request we already know will be refused.
    if (quota.dailyRemaining === 0) {
      throw new ApiFootballError(
        "quota",
        "API-Football daily quota exhausted; try again tomorrow.",
      );
    }

    const url = new URL(endpoint.replace(/^\/?/, "/"), baseUrl);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { "x-apisports-key": apiKey, accept: "application/json" },
        cache: "no-store",
      });
    } catch (err) {
      throw new ApiFootballError("network", `Could not reach API-Football: ${String(err)}`);
    }

    quota = {
      dailyLimit: toInt(res.headers.get(HEADER_DAILY_LIMIT)) ?? quota.dailyLimit,
      dailyRemaining: toInt(res.headers.get(HEADER_DAILY_REMAINING)) ?? quota.dailyRemaining,
      minuteLimit: toInt(res.headers.get(HEADER_MINUTE_LIMIT)) ?? quota.minuteLimit,
      minuteRemaining: toInt(res.headers.get(HEADER_MINUTE_REMAINING)) ?? quota.minuteRemaining,
    };
    const log =
      quota.dailyRemaining != null && quota.dailyRemaining < 10 ? logger.warn : logger.info;
    log(
      `[api-football] GET ${endpoint} -> ${res.status} | daily ${quota.dailyRemaining ?? "?"}/${quota.dailyLimit ?? "?"} left | minute ${quota.minuteRemaining ?? "?"}/${quota.minuteLimit ?? "?"} left`,
    );

    if (res.status === 429) {
      throw new ApiFootballError("rate_limit", "API-Football rate limit hit (HTTP 429).", 429);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ApiFootballError(
        "auth",
        `API-Football rejected the request (HTTP ${res.status}).`,
        res.status,
      );
    }
    if (!res.ok) {
      throw new ApiFootballError("http", `API-Football HTTP ${res.status}`, res.status);
    }

    let body: ApiFootballEnvelope<T>;
    try {
      body = (await res.json()) as ApiFootballEnvelope<T>;
    } catch {
      throw new ApiFootballError("http", "API-Football returned invalid JSON", res.status);
    }

    const apiError = classifyApiErrors(body.errors);
    if (apiError) throw apiError;

    if (cache && (!shouldCache || shouldCache(body.response))) {
      await cache.set(endpoint, paramsHash, params, body);
    }
    return { data: body.response, fromCache: false, results: body.results };
  }

  return {
    request,
    getQuota: (): Quota => ({ ...quota }),

    /** Account/quota info. Never cached: it is cheap, changes constantly and contains the account email. */
    status: () =>
      request<ApiStatus>("/status", {}, { maxAgeMs: 0, force: true, shouldCache: () => false }),

    /** All fixtures for a team in a season (every competition in one call). */
    teamFixtures: (teamId: number, season: number, opts?: RequestOptions<ApiFixture[]>) =>
      request<ApiFixture[]>("/fixtures", { team: teamId, season }, opts),

    fixture: (fixtureId: number, opts?: RequestOptions<ApiFixture[]>) =>
      request<ApiFixture[]>("/fixtures", { id: fixtureId }, opts),

    squad: (teamId: number, opts?: RequestOptions<ApiSquad[]>) =>
      request<ApiSquad[]>("/players/squads", { team: teamId }, opts),

    lineups: (fixtureId: number, opts?: RequestOptions<ApiLineup[]>) =>
      request<ApiLineup[]>("/fixtures/lineups", { fixture: fixtureId }, opts),

    fixturePlayers: (fixtureId: number, opts?: RequestOptions<ApiFixturePlayers[]>) =>
      request<ApiFixturePlayers[]>("/fixtures/players", { fixture: fixtureId }, opts),
  };
}

export type ApiFootballClient = ReturnType<typeof createApiFootballClient>;
