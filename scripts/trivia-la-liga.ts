/**
 * One-time La Liga import for trivia: every La Liga club and player, trophies, records and
 * Culé Ten lists (Wikipedia + Wikidata, ~2–4 minutes). Re-runnable; reviewed lists are kept.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-la-liga.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importLaLiga } = await import("../src/features/trivia/liga-import");

const t0 = Date.now();
const seconds = () => Math.round((Date.now() - t0) / 1000);
const result = await importLaLiga(createAdminClient(), (msg) =>
  console.log(`[${seconds()}s] ${msg}`),
);
console.log(`${result.message} (${seconds()}s)`);
