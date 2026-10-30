/**
 * Imports for the newer games (re-runnable): Ballon d'Or podiums, final line-ups (Missing
 * XI) and club careers for every La Liga player (not just the famous ones). ~5–10 minutes.
 * Flags: --skip-careers, --careers-only.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-more.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importBallonDor, importFinalLineups } = await import("../src/features/trivia/more-import");
const { importCareers } = await import("../src/features/career/import");

const t0 = Date.now();
const log = (msg: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${msg}`);
const db = createAdminClient();
if (!process.argv.includes("--careers-only")) {
  await importBallonDor(db, log);
  await importFinalLineups(db, log);
}
if (!process.argv.includes("--skip-careers")) {
  const careers = await importCareers(
    db,
    (m) => (m.endsWith("players") && !m.includes("000/") ? undefined : log(m)),
    0,
  );
  log(`Careers: ${careers.saved} of ${careers.players} La Liga players`);
}
