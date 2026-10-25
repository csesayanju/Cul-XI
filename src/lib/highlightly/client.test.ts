import { describe, expect, it, vi } from "vitest";

import lineupsSample from "./__fixtures__/lineups.json";
import matchesSample from "./__fixtures__/matches.json";
import {
  createHighlightlyClient,
  hashParams,
  normaliseParams,
  ProviderError,
  type ApiCache,
  type CachedResponse,
} from "./client";
import { hasLineups } from "./mappers";
import type { HlLineups } from "./types";

function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "x-ratelimit-requests-limit": "100",
      "x-ratelimit-requests-remaining": "88",
      ...init.headers,
    },
  });
}

function memoryCache() {
  const store = new Map<string, CachedResponse>();
  const cache: ApiCache = {
    get: async (e, h) => store.get(`${e}:${h}`) ?? null,
    set: async (e, h, _p, response) => {
      store.set(`${e}:${h}`, { response, fetchedAt: new Date() });
    },
  };
  return { cache, store };
}

const silent = { info: vi.fn(), warn: vi.fn() };

function setup(responses: Response[], opts: { cache?: ApiCache; now?: () => Date } = {}) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const r of responses) fetchMock.mockResolvedValueOnce(r);
  const client = createHighlightlyClient({
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    fetch: fetchMock,
    logger: silent,
    ...opts,
  });
  return { client, fetchMock };
}

const emptyPage = { data: [], pagination: { totalCount: 0, offset: 0, limit: 100 } };

describe("params hashing", () => {
  it("is order-independent and ignores undefined/empty values", () => {
    const a = normaliseParams({ homeTeamId: 529, season: 2026, extra: undefined });
    const b = normaliseParams({ season: "2026", homeTeamId: "529", blank: "" });
    expect(a).toEqual({ homeTeamId: "529", season: "2026" });
    expect(hashParams(a)).toBe(hashParams(b));
  });
});

describe("createHighlightlyClient", () => {
  it("sends the API key header and fetches home + away matches for a team", async () => {
    const { client, fetchMock } = setup([jsonResponse(matchesSample), jsonResponse(emptyPage)]);
    const { data } = await client.teamSeasonMatches(1100000529, 2026);

    expect(data).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      "https://api.example.test/matches?homeTeamId=1100000529&limit=100&season=2026",
      "https://api.example.test/matches?awayTeamId=1100000529&limit=100&season=2026",
    ]);
    const init = fetchMock.mock.calls[0]![1];
    expect((init?.headers as Record<string, string>)["x-rapidapi-key"]).toBe("test-key");
  });

  it("records and logs the remaining daily quota", async () => {
    const { client } = setup([jsonResponse(lineupsSample)]);
    await client.lineups(1990000001);
    expect(client.getQuota()).toEqual({ dailyLimit: 100, dailyRemaining: 88 });
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining("daily 88/100 left"));
  });

  it("serves repeated requests from the cache", async () => {
    const { cache } = memoryCache();
    const { client, fetchMock } = setup([jsonResponse(lineupsSample)], { cache });

    const first = await client.lineups(1990000001);
    const second = await client.lineups(1990000001);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  it("refetches when the cached entry is older than maxAgeMs", async () => {
    const { cache } = memoryCache();
    let now = new Date("2026-10-24T10:00:00Z");
    const { client, fetchMock } = setup(
      [jsonResponse(lineupsSample), jsonResponse(lineupsSample)],
      { cache, now: () => now },
    );
    await client.lineups(1, { maxAgeMs: 60_000 });
    now = new Date(Date.now() + 120_000);
    await client.lineups(1, { maxAgeMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects shouldCache (e.g. line-ups not announced yet)", async () => {
    const { cache, store } = memoryCache();
    const empty: HlLineups = { homeTeam: null, awayTeam: null };
    const { client, fetchMock } = setup([jsonResponse(empty), jsonResponse(lineupsSample)], {
      cache,
    });

    expect(hasLineups((await client.lineups(1, { shouldCache: hasLineups })).data)).toBe(false);
    expect(store.size).toBe(0);
    expect(hasLineups((await client.lineups(1, { shouldCache: hasLineups })).data)).toBe(true);
    expect(store.size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [400, "api"],
    [500, "http"],
  ])("maps HTTP %i to %s without retrying", async (status, kind) => {
    const { client, fetchMock } = setup([
      jsonResponse({ message: "Something went wrong", statusCode: status }, { status }),
    ]);
    await expect(client.boxScore(1)).rejects.toMatchObject({ name: "ProviderError", kind });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includes the API's error message", async () => {
    const { client } = setup([
      jsonResponse({ message: "Invalid season", statusCode: 400 }, { status: 400 }),
    ]);
    await expect(client.boxScore(1)).rejects.toThrow(/Invalid season/);
  });

  it("treats HTTP 429 as a rate limit, or quota when none remain", async () => {
    const { client } = setup([jsonResponse({}, { status: 429 })]);
    await expect(client.boxScore(1)).rejects.toMatchObject({ kind: "rate_limit" });

    const { client: exhausted } = setup([
      jsonResponse({}, { status: 429, headers: { "x-ratelimit-requests-remaining": "0" } }),
    ]);
    await expect(exhausted.boxScore(1)).rejects.toMatchObject({ kind: "quota" });
  });

  it("refuses to call once the daily quota is known to be exhausted", async () => {
    const { client, fetchMock } = setup([
      jsonResponse(lineupsSample, { headers: { "x-ratelimit-requests-remaining": "0" } }),
    ]);
    await client.lineups(1);
    await expect(client.boxScore(1)).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed responses", async () => {
    const { cache, store } = memoryCache();
    const { client } = setup([jsonResponse({}, { status: 500 })], { cache });
    await expect(client.boxScore(1)).rejects.toMatchObject({ kind: "http" });
    expect(store.size).toBe(0);
  });

  it("wraps network failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = createHighlightlyClient({ apiKey: "k", fetch: fetchMock, logger: silent });
    await expect(client.boxScore(1)).rejects.toMatchObject({ kind: "network" });
  });
});
