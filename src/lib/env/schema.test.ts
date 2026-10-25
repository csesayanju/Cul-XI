import { describe, expect, it } from "vitest";

import { apiFootballEnvSchema, parseEnv, serverEnvSchema } from "./schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  API_FOOTBALL_KEY: "key",
  API_FOOTBALL_BASE_URL: "https://v3.football.api-sports.io",
  BARCA_TEAM_ID: "529",
  LALIGA_LEAGUE_ID: "140",
  UCL_LEAGUE_ID: "2",
  COPA_DEL_REY_LEAGUE_ID: "",
  CURRENT_SEASON: "2026",
  APP_URL: "http://localhost:3000",
  ADMIN_EMAILS: " Admin@Example.com, other@example.com ,",
  INVITE_CODE: "invite",
  CRON_SECRET: "a-long-secret",
};

describe("env schema", () => {
  it("parses a complete server env and coerces types", () => {
    const env = parseEnv(serverEnvSchema, valid, "server");
    expect(env.BARCA_TEAM_ID).toBe(529);
    expect(env.CURRENT_SEASON).toBe(2026);
    expect(env.COPA_DEL_REY_LEAGUE_ID).toBeUndefined();
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.com", "other@example.com"]);
  });

  it("fails fast with a message naming every missing variable", () => {
    const { API_FOOTBALL_KEY: _k, INVITE_CODE: _i, ...rest } = valid;
    expect(() => parseEnv(serverEnvSchema, rest, "server")).toThrowError(
      /API_FOOTBALL_KEY[\s\S]*INVITE_CODE/,
    );
  });

  it("applies API-Football defaults", () => {
    const env = parseEnv(
      apiFootballEnvSchema,
      { API_FOOTBALL_KEY: "k", CURRENT_SEASON: "2026" },
      "api",
    );
    expect(env.API_FOOTBALL_BASE_URL).toBe("https://v3.football.api-sports.io");
    expect(env.LALIGA_LEAGUE_ID).toBe(140);
    expect(env.UCL_LEAGUE_ID).toBe(2);
  });

  it("rejects a short CRON_SECRET", () => {
    expect(() => parseEnv(serverEnvSchema, { ...valid, CRON_SECRET: "short" }, "server")).toThrow(
      /CRON_SECRET/,
    );
  });
});
