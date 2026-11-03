import { matchdayTick } from "@/features/fantasy/sync/on-demand";
import { createSyncRoute } from "@/features/fantasy/sync/route-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Matchday tick for the watcher workflow: squads before kickoff, line-ups, live points and
 * final stats as they fall due. `details.active` says whether to keep watching.
 */
export const { GET, POST } = createSyncRoute(async () => {
  const { active, message } = await matchdayTick();
  return { ok: true, message, details: { active } };
});
