import "server-only";

import { NextResponse } from "next/server";

import { ApiFootballError } from "@/lib/api-football/client";
import { isCronOrAdmin } from "@/lib/auth";

import { createSyncContext, type SyncContext, type SyncResult } from "./context";

export interface SyncParams {
  matchId?: number;
  force: boolean;
}

/**
 * Wraps a sync job as a Route Handler. Accepts GET (Vercel Cron) and POST.
 * Auth: `Authorization: Bearer $CRON_SECRET` or a signed-in admin.
 * Optional query params: `matchId`, `force=1`.
 */
export function createSyncRoute(
  job: (ctx: SyncContext, params: SyncParams) => Promise<SyncResult>,
) {
  async function handler(request: Request) {
    if (!(await isCronOrAdmin(request))) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const matchIdParam = url.searchParams.get("matchId");
    const matchId = matchIdParam ? Number.parseInt(matchIdParam, 10) : undefined;
    if (matchIdParam && !Number.isFinite(matchId)) {
      return NextResponse.json({ ok: false, message: "Invalid matchId" }, { status: 400 });
    }

    try {
      const result = await job(createSyncContext(), {
        matchId,
        force: url.searchParams.get("force") === "1",
      });
      return NextResponse.json(result);
    } catch (err) {
      const status = err instanceof ApiFootballError && err.kind === "rate_limit" ? 429 : 500;
      const message = err instanceof Error ? err.message : "Sync failed";
      console.error("[sync]", message);
      return NextResponse.json({ ok: false, message }, { status });
    }
  }

  return { GET: handler, POST: handler };
}
