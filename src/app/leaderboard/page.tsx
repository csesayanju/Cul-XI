import type { Metadata } from "next";
import Link from "next/link";

import { Card, cx, Notice, PageTitle } from "@/components/ui";
import { buildStandings, type Standing } from "@/features/fantasy/leaderboard";
import { getMyLeague } from "@/features/fantasy/queries";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leaderboard" };

function Table({ rows, meId }: { rows: Standing[]; meId: string }) {
  return (
    <Card className="p-0">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-ink-muted uppercase">
          <tr>
            <th className="w-10 p-3">#</th>
            <th className="p-3">Player</th>
            <th className="p-3 text-right">Played</th>
            <th className="p-3 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.userId}
              className={cx("border-t border-line", r.userId === meId && "bg-gold-300/30")}
            >
              <td className="p-3 font-bold">{r.rank}</td>
              <td className="p-3">{r.name}</td>
              <td className="p-3 text-right text-ink-muted">{r.played}</td>
              <td className="p-3 text-right font-black">{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ match?: string }>;
}) {
  const user = await requireUser();
  const { match } = await searchParams;
  const supabase = await createClient();

  const league = await getMyLeague(supabase, user.id);
  if (!league) {
    return (
      <>
        <PageTitle>Leaderboard</PageTitle>
        <Notice>
          You&apos;re not in a league yet.{" "}
          <Link href="/join" className="underline">
            Join with an invite code
          </Link>
          .
        </Notice>
      </>
    );
  }

  const [{ data: points }, { data: scoredMatches }] = await Promise.all([
    supabase
      .from("fantasy_points")
      .select("user_id, match_id, total_points")
      .in("user_id", [...league.members.keys()]),
    supabase
      .from("matches")
      .select("id, opponent_name, kickoff_at")
      .not("points_calculated_at", "is", null)
      .order("kickoff_at", { ascending: false }),
  ]);

  const rows = (points ?? []).map((p) => ({
    userId: p.user_id as string,
    matchId: Number(p.match_id),
    points: Number(p.total_points),
  }));
  const matches = (scoredMatches ?? []) as {
    id: number;
    opponent_name: string;
    kickoff_at: string;
  }[];
  const selectedMatch = match ? matches.find((m) => m.id === Number(match)) : undefined;

  const standings = buildStandings(
    selectedMatch ? rows.filter((r) => r.matchId === selectedMatch.id) : rows,
    league.members,
  );

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={cx(
        "min-h-9 shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold",
        active ? "border-transparent bg-brand text-brand-ink" : "border-line",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageTitle subtitle={league.name}>Leaderboard</PageTitle>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {tab("/leaderboard", "Season", !selectedMatch)}
        {matches.map((m) =>
          tab(`/leaderboard?match=${m.id}`, `vs ${m.opponent_name}`, selectedMatch?.id === m.id),
        )}
      </div>
      {matches.length === 0 && (
        <div className="mb-4">
          <Notice>No points yet — the table fills up after the first match is scored.</Notice>
        </div>
      )}
      <Table rows={standings} meId={user.id} />
    </>
  );
}
