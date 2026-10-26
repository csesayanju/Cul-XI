import type { Metadata } from "next";

import { Card, Notice, PageTitle } from "@/components/ui";
import { listMatchPlayers } from "@/features/fantasy/queries";
import { toStats } from "@/features/fantasy/sync/recalculate-points";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { StatsEditor, SyncPanel, type EditablePlayer } from "./admin-forms";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  await requireAdmin();
  const { match } = await searchParams;
  const supabase = await createClient();

  const { data: matchRows } = await supabase
    .from("matches")
    .select("id, opponent_name, kickoff_at, status")
    .order("kickoff_at", { ascending: false })
    .limit(40);
  const matches = (matchRows ?? []).map((m) => ({
    id: Number(m.id),
    label: `${new Date(m.kickoff_at as string).toISOString().slice(0, 10)} · vs ${m.opponent_name} (${m.status})`,
  }));

  const selectedId = match ? Number(match) : matches[0]?.id;
  let editable: EditablePlayer[] = [];
  if (selectedId) {
    const [players, { data: stats }] = await Promise.all([
      listMatchPlayers(supabase, selectedId),
      supabase.from("player_match_stats").select("*").eq("match_id", selectedId),
    ]);
    const statsById = new Map((stats ?? []).map((s) => [Number(s.player_id), s]));
    editable = players
      .map((p) => {
        const row = statsById.get(p.id);
        return {
          id: p.id,
          name: p.name,
          teamName: p.teamName,
          position: p.position,
          price: p.price,
          priceLocked: p.priceLocked,
          stats: row ? { ...toStats(row), source: row.source as "api" | "manual" } : null,
        };
      })
      .sort((a, b) => Number(!!b.stats) - Number(!!a.stats) || a.name.localeCompare(b.name));
  }

  return (
    <>
      <PageTitle subtitle="Sync data from Highlightly (free plan: 100 requests/day) and fix stats.">
        Admin
      </PageTitle>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Sync</h2>
        <Card>
          <SyncPanel matches={matches} />
        </Card>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">Enter / override stats</h2>
        {matches.length === 0 ? (
          <Notice>No matches yet — sync fixtures first.</Notice>
        ) : (
          <Card className="space-y-3">
            <form className="flex gap-2">
              <select
                name="match"
                defaultValue={selectedId}
                className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-3"
                aria-label="Match"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold">
                Load
              </button>
            </form>
            {selectedId && <StatsEditor matchId={selectedId} players={editable} />}
          </Card>
        )}
      </section>
    </>
  );
}
