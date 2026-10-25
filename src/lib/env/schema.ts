import { z } from "zod";

/**
 * Environment schemas. This module is pure (no `server-only`) so it can be reused by
 * Node scripts (`pnpm check:api`) and unit tests. App code should import from
 * `@/lib/env/server` or `@/lib/env/public` instead.
 */

/** Treats empty strings (e.g. `COPA_DEL_REY_LEAGUE_ID=`) as "not set". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const positiveInt = z.coerce.number().int().positive();
const optionalPositiveInt = z.preprocess(emptyToUndefined, positiveInt.optional());
const required = (name: string) =>
  z.preprocess(emptyToUndefined, z.string({ error: `${name} is required` }).min(1));

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.preprocess(emptyToUndefined, z.url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});

const requiredId = (name: string, hint: string) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: `${name} is required (${hint})` })
      .int()
      .positive(),
  );

/** Data provider settings. Team/league ids are optional here so `pnpm check:api` can discover them. */
export const providerEnvSchema = z.object({
  HIGHLIGHTLY_API_KEY: required("HIGHLIGHTLY_API_KEY"),
  HIGHLIGHTLY_BASE_URL: z.preprocess(
    emptyToUndefined,
    z.url().default("https://soccer.highlightly.net"),
  ),
  BARCA_TEAM_ID: optionalPositiveInt,
  LALIGA_LEAGUE_ID: optionalPositiveInt,
  UCL_LEAGUE_ID: optionalPositiveInt,
  COPA_DEL_REY_LEAGUE_ID: optionalPositiveInt,
  CURRENT_SEASON: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ error: "CURRENT_SEASON is required (the year the season starts, e.g. 2026)" })
      .int()
      .min(2000)
      .max(2100),
  ),
});

export const serverEnvSchema = publicEnvSchema.extend({
  ...providerEnvSchema.shape,
  BARCA_TEAM_ID: requiredId("BARCA_TEAM_ID", "run `pnpm check:api` to look it up"),
  LALIGA_LEAGUE_ID: requiredId("LALIGA_LEAGUE_ID", "run `pnpm check:api` to look it up"),
  UCL_LEAGUE_ID: requiredId("UCL_LEAGUE_ID", "run `pnpm check:api` to look it up"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),
  APP_URL: z.preprocess(emptyToUndefined, z.url().default("http://localhost:3000")),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  INVITE_CODE: required("INVITE_CODE"),
  CRON_SECRET: required("CRON_SECRET").pipe(
    z.string().min(8, "CRON_SECRET must be at least 8 characters"),
  ),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ProviderEnv = z.infer<typeof providerEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parses `source` with `schema` and throws a readable error listing every missing or
 * invalid variable, so misconfiguration fails fast instead of surfacing as a vague bug.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined>,
  label: string,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid ${label} environment variables:\n${issues}\n` +
        `Copy .env.example to .env.local and fill in the missing values.`,
    );
  }
  return result.data;
}
