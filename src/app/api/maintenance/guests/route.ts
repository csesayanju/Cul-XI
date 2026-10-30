import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { cleanupGuests } from "@/features/maintenance/cleanup-guests";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Deletes guest accounts nobody has used for 7 days. */
export const { GET, POST } = createSyncRoute((ctx) => cleanupGuests(ctx.db, ctx.now));
