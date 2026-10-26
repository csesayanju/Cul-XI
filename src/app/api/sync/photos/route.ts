import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncPhotos } from "@/features/fantasy/sync/sync-photos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx, { matchId }) => syncPhotos(ctx, { matchId }));
