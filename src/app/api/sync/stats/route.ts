import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncStats } from "@/features/fantasy/sync/sync-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx, { matchId }) => syncStats(ctx, { matchId }));
