/**
 * One-time imports for the extra trivia games: club logos (Tiki-Taka-Toe) and club careers
 * of well-known La Liga players (Career Path). Run after scripts/trivia-la-liga.ts.
 * Add --badges-only to refresh just the badges.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-extras.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importCareers, importClubLogos, importWikipediaBadges } =
  await import("../src/features/career/import");

const t0 = Date.now();
const log = (msg: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${msg}`);
const db = createAdminClient();
await importClubLogos(db, log);
await importWikipediaBadges(db, log);
if (process.argv.includes("--badges-only")) process.exit(0);
const careers = await importCareers(db, log);
log(`Done: careers for ${careers.saved} of ${careers.players} players`);
