import "server-only";

import { parseEnv, serverEnvSchema, type ServerEnv } from "./schema";

let cached: ServerEnv | undefined;

/**
 * Server-only environment (secrets included). Importing this file from a Client Component
 * is a build error thanks to `server-only`. Parsed lazily on first use so `next build`
 * does not require secrets, then cached.
 */
export function serverEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env, "server");
  return cached;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return serverEnv().ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
