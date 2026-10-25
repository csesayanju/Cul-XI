import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncFixtures } from "@/features/fantasy/sync/sync-fixtures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx, { force }) => syncFixtures(ctx, { force }));
