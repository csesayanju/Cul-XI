/**
 * Imports Barça seasons, La Liga podiums and every competitive Clásico from Wikipedia.
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/history-import.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importHistory } = await import("../src/features/which-season/import");

await importHistory(createAdminClient());
