import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncLineups } from "@/features/fantasy/sync/sync-lineups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx, { matchId }) => syncLineups(ctx, { matchId }));
