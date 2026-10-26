import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncProfiles } from "@/features/fantasy/sync/sync-profiles";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Market values, injury reports and season stats for upcoming matches' players (budgeted). */
export const { GET, POST } = createSyncRoute((ctx) => syncProfiles(ctx));
