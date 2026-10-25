import { describe, expect, it } from "vitest";

import { parseEnv, providerEnvSchema, serverEnvSchema } from "./schema";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  HIGHLIGHTLY_API_KEY: "key",
  HIGHLIGHTLY_BASE_URL: "https://soccer.highlightly.net",
  BARCA_TEAM_ID: "1002433681",
  LALIGA_LEAGUE_ID: "119924",
  UCL_LEAGUE_ID: "2486",
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
    expect(env.BARCA_TEAM_ID).toBe(1002433681);
    expect(env.CURRENT_SEASON).toBe(2026);
    expect(env.COPA_DEL_REY_LEAGUE_ID).toBeUndefined();
    expect(env.ADMIN_EMAILS).toEqual(["admin@example.com", "other@example.com"]);
  });

  it("fails fast with a message naming every missing variable", () => {
    const { HIGHLIGHTLY_API_KEY: _k, INVITE_CODE: _i, ...rest } = valid;
    expect(() => parseEnv(serverEnvSchema, rest, "server")).toThrowError(
      /HIGHLIGHTLY_API_KEY[\s\S]*INVITE_CODE/,
    );
  });

  it("lets check:api run before team/league ids are known", () => {
    const env = parseEnv(
      providerEnvSchema,
      { HIGHLIGHTLY_API_KEY: "k", CURRENT_SEASON: "2026", BARCA_TEAM_ID: "" },
      "provider",
    );
    expect(env.HIGHLIGHTLY_BASE_URL).toBe("https://soccer.highlightly.net");
    expect(env.BARCA_TEAM_ID).toBeUndefined();
  });

  it("requires team/league ids for the app itself", () => {
    const { BARCA_TEAM_ID: _b, ...rest } = valid;
    expect(() => parseEnv(serverEnvSchema, rest, "server")).toThrow(/BARCA_TEAM_ID.*check:api/);
  });

  it("rejects a short CRON_SECRET", () => {
    expect(() => parseEnv(serverEnvSchema, { ...valid, CRON_SECRET: "short" }, "server")).toThrow(
      /CRON_SECRET/,
    );
  });
});
