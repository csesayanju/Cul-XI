/**
 * One-time Culé Ten repository import (same as the button on /admin/trivia).
 * Usage: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/trivia-import.ts
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const { createAdminClient } = await import("../src/lib/supabase/admin");
const { importRepository } = await import("../src/features/trivia/server");
const { serverEnv } = await import("../src/lib/env/server");

const t0 = Date.now();
const result = await importRepository(createAdminClient(), serverEnv().BARCA_TEAM_ID);
console.log(`${result.message} (${Math.round((Date.now() - t0) / 1000)}s)`);
