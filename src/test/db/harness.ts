import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const root = fileURLToPath(new URL("../../../supabase", import.meta.url));

/**
 * Minimal stand-in for what Supabase provides before our migrations run: the `auth`
 * schema, `auth.uid()` / `auth.role()`, and the anon / authenticated / service_role roles
 * with Supabase's default grants.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud text, role text, email text unique,
    encrypted_password text, email_confirmed_at timestamptz,
    raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    created_at timestamptz, updated_at timestamptz,
    confirmation_token text, recovery_token text, email_change_token_new text, email_change text
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;

  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  const dir = join(root, "migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));
}

export async function createTestDb({ seed = true } = {}): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(file, "utf8"));
  }
  if (seed) await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  return db;
}

const ROLLBACK = Symbol("rollback");

/**
 * Runs `fn` as an authenticated user (or anon when `userId` is null) inside a transaction
 * that is always rolled back, so tests never leak state into each other.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
  { setupSql }: { setupSql?: string } = {},
): Promise<T> {
  let result: T | undefined;
  try {
    await db.transaction(async (tx) => {
      // Optional fixture tweaks, applied as the superuser and rolled back with everything else.
      if (setupSql) await tx.exec(setupSql);
      await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
      result = await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return result as T;
}
