/**
 * One-time Barça history import for Culé Ten (same as the button on /admin/trivia).
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-history.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importHistory } = await import("../src/features/trivia/server");

const t0 = Date.now();
const result = await importHistory(createAdminClient());
console.log(`${result.message} (${Math.round((Date.now() - t0) / 1000)}s)`);
