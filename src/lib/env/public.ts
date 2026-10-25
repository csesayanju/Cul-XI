import { parseEnv, publicEnvSchema, type PublicEnv } from "./schema";

let cached: PublicEnv | undefined;

/**
 * Browser-safe environment. Each variable is referenced literally so Next.js can inline
 * `NEXT_PUBLIC_*` values into client bundles.
 */
export function publicEnv(): PublicEnv {
  cached ??= parseEnv(
    publicEnvSchema,
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    },
    "public",
  );
  return cached;
}
