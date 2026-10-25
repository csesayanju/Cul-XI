import { describe, expect, it, vi } from "vitest";

import fixturesSample from "./__fixtures__/fixtures.json";
import lineupsSample from "./__fixtures__/fixtures-lineups.json";
import statusSample from "./__fixtures__/status.json";
import {
  ApiFootballError,
  createApiFootballClient,
  hashParams,
  normaliseParams,
  type ApiCache,
  type CachedResponse,
} from "./client";

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
      "x-ratelimit-limit": "10",
      "x-ratelimit-remaining": "9",
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
  const client = createApiFootballClient({
    apiKey: "test-key",
    baseUrl: "https://api.example.test",
    fetch: fetchMock,
    logger: silent,
    ...opts,
  });
  return { client, fetchMock };
}

describe("params hashing", () => {
  it("is order-independent and ignores undefined/empty values", () => {
    const a = normaliseParams({ team: 529, season: 2026, extra: undefined });
    const b = normaliseParams({ season: "2026", team: "529", blank: "" });
    expect(a).toEqual({ season: "2026", team: "529" });
    expect(hashParams(a)).toBe(hashParams(b));
  });
});

describe("createApiFootballClient", () => {
  it("sends the API key header and builds the query string", async () => {
    const { client, fetchMock } = setup([jsonResponse(fixturesSample)]);
    const { data } = await client.teamFixtures(529, 2026);

    expect(data).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.example.test/fixtures?season=2026&team=529");
    expect((init?.headers as Record<string, string>)["x-apisports-key"]).toBe("test-key");
  });

  it("records and logs the remaining quota", async () => {
    const { client } = setup([jsonResponse(fixturesSample)]);
    await client.teamFixtures(529, 2026);
    expect(client.getQuota()).toEqual({
      dailyLimit: 100,
      dailyRemaining: 88,
      minuteLimit: 10,
      minuteRemaining: 9,
    });
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining("daily 88/100 left"));
  });

  it("serves repeated requests from the cache", async () => {
    const { cache } = memoryCache();
    const { client, fetchMock } = setup([jsonResponse(fixturesSample)], { cache });

    const first = await client.teamFixtures(529, 2026);
    const second = await client.teamFixtures(529, 2026);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.data).toEqual(first.data);
  });

  it("refetches when the cached entry is older than maxAgeMs", async () => {
    const { cache } = memoryCache();
    let now = new Date("2026-10-24T10:00:00Z");
    const { client, fetchMock } = setup(
      [jsonResponse(fixturesSample), jsonResponse(fixturesSample)],
      { cache, now: () => now },
    );
    await client.teamFixtures(529, 2026, { maxAgeMs: 60_000 });
    now = new Date(Date.now() + 120_000);
    await client.teamFixtures(529, 2026, { maxAgeMs: 60_000 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("respects shouldCache (e.g. lineups not announced yet)", async () => {
    const { cache, store } = memoryCache();
    const empty = { ...lineupsSample, results: 0, response: [] };
    const { client, fetchMock } = setup([jsonResponse(empty), jsonResponse(lineupsSample)], {
      cache,
    });
    const opts = { shouldCache: (d: unknown[]) => d.length > 0 };

    expect((await client.lineups(990001, opts)).data).toEqual([]);
    expect(store.size).toBe(0);
    expect((await client.lineups(990001, opts)).data).toHaveLength(2);
    expect(store.size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never caches /status (it contains the account email)", async () => {
    const { cache, store } = memoryCache();
    const { client } = setup([jsonResponse(statusSample)], { cache });
    const { data } = await client.status();
    expect(data.requests.limit_day).toBe(100);
    expect(store.size).toBe(0);
  });

  it.each([
    [
      { rateLimit: "Too many requests. You have exceeded the limit of requests per minute." },
      "rate_limit",
    ],
    [{ requests: "You have reached the request limit for the day." }, "quota"],
    [{ token: "Error/Missing application key." }, "auth"],
    [{ season: "Free plans do not have access to this season." }, "api"],
  ])("maps API error body %j to kind %s without retrying", async (errors, kind) => {
    const { client, fetchMock } = setup([
      jsonResponse({ ...fixturesSample, errors, results: 0, response: [] }),
    ]);
    await expect(client.teamFixtures(529, 2026)).rejects.toMatchObject({
      name: "ApiFootballError",
      kind,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats HTTP 429 as a rate limit and does not retry", async () => {
    const { client, fetchMock } = setup([jsonResponse({}, { status: 429 })]);
    await expect(client.teamFixtures(529, 2026)).rejects.toMatchObject({ kind: "rate_limit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to call once the daily quota is known to be exhausted", async () => {
    const { client, fetchMock } = setup([
      jsonResponse(fixturesSample, { headers: { "x-ratelimit-requests-remaining": "0" } }),
    ]);
    await client.teamFixtures(529, 2026);
    await expect(client.squad(529)).rejects.toBeInstanceOf(ApiFootballError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache failed responses", async () => {
    const { cache, store } = memoryCache();
    const { client } = setup([jsonResponse({}, { status: 500 })], { cache });
    await expect(client.teamFixtures(529, 2026)).rejects.toMatchObject({ kind: "http" });
    expect(store.size).toBe(0);
  });

  it("wraps network failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const client = createApiFootballClient({ apiKey: "k", fetch: fetchMock, logger: silent });
    await expect(client.squad(529)).rejects.toMatchObject({ kind: "network" });
  });
});
