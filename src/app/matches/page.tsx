import type { Metadata } from "next";
import Link from "next/link";

import { LocalTime } from "@/components/local-time";
import { Badge, Card, Notice, PageTitle } from "@/components/ui";
import { COMPETITION_LABELS } from "@/features/fantasy/labels";
import { listMatches, type MatchSummary } from "@/features/fantasy/queries";
import { requireUser } from "@/lib/auth";
import { hasKickedOff } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Matches" };

function MatchCard({ match, hasTeam }: { match: MatchSummary; hasTeam: boolean }) {
  const started = hasKickedOff(match.kickoff_at);
  const score =
    match.barca_goals != null && match.opponent_goals != null
      ? `${match.barca_goals}–${match.opponent_goals}`
      : null;

  return (
    <Link href={`/matches/${match.id}/pick`}>
      <Card className="flex items-center justify-between gap-3 transition hover:border-accent">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={match.competition === "ucl" ? "blue" : "garnet"}>
              {COMPETITION_LABELS[match.competition]}
            </Badge>
            <span className="text-xs text-ink-muted">{match.is_home ? "Home" : "Away"}</span>
          </div>
          <p className="truncate font-bold">
            {match.is_home ? `Barça vs ${match.opponent_name}` : `${match.opponent_name} vs Barça`}
          </p>
          <p className="text-sm text-ink-muted">
            <LocalTime iso={match.kickoff_at} />
            {score && <span className="ml-2 font-semibold text-ink">FT {score}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right text-sm">
          {started ? (
            <Badge tone="neutral">{hasTeam ? "Locked" : "No team"}</Badge>
          ) : (
            <Badge tone={hasTeam ? "gold" : "garnet"}>{hasTeam ? "Edit XI" : "Pick XI"}</Badge>
          )}
        </div>
      </Card>
    </Link>
  );
}

export default async function MatchesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ upcoming, recent }, teams] = await Promise.all([
    listMatches(supabase),
    supabase.from("fantasy_teams").select("match_id").eq("user_id", user.id),
  ]);
  const myMatches = new Set((teams.data ?? []).map((t) => Number(t.match_id)));

  return (
    <>
      <PageTitle subtitle="Teams lock at kickoff. Points land after full time.">Matches</PageTitle>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">Upcoming</h2>
        {upcoming.length === 0 && (
          <Notice>No upcoming matches yet. An admin needs to sync fixtures.</Notice>
        )}
        {upcoming.map((m) => (
          <MatchCard key={m.id} match={m} hasTeam={myMatches.has(m.id)} />
        ))}
      </section>

      {recent.length > 0 && (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">Recent</h2>
          {recent.map((m) => (
            <MatchCard key={m.id} match={m} hasTeam={myMatches.has(m.id)} />
          ))}
        </section>
      )}
    </>
  );
}
