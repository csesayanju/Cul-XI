import { createSyncRoute } from "@/features/fantasy/sync/route-handler";
import { syncValues } from "@/features/fantasy/sync/sync-values";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const { GET, POST } = createSyncRoute((ctx) => syncValues(ctx));
