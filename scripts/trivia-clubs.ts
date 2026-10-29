/**
 * One-time Tiki-Taka-Toe data import: the other clubs every Barça player played for (Wikidata).
 * Also runs as part of the player import on /admin/trivia.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-clubs.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importClubs } = await import("../src/features/tiki-taka-toe/server");

const t0 = Date.now();
const r = await importClubs(createAdminClient());
console.log(
  `Saved ${r.clubs} clubs and ${r.links} player-club links (${Math.round((Date.now() - t0) / 1000)}s)`,
);
