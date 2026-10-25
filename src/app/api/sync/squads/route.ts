import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncSquads } from "@/features/fantasy/sync/sync-squads";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx, { matchId }) => syncSquads(ctx, { matchId }));
