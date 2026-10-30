import type { Metadata } from "next";
import Link from "next/link";

import { LocalDateTile, LocalTime } from "@/components/local-time";
import { Badge, Card, Notice, PageTitle, SectionTitle } from "@/components/ui";
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
  const home = match.is_home ? "Barça" : match.opponent_name;
  const away = match.is_home ? match.opponent_name : "Barça";

  return (
    <Link href={`/matches/${match.id}/pick`} className="group block">
      <Card className="flex items-center gap-3 p-3 transition duration-150 group-hover:border-accent/60 group-active:scale-[0.99]">
        <LocalDateTile
          iso={match.kickoff_at}
          className={started ? "bg-line/50 text-ink-muted" : "bg-brand text-brand-ink"}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={match.competition === "ucl" ? "blue" : "garnet"}>
              {COMPETITION_LABELS[match.competition]}
            </Badge>
            <span className="text-[11px] font-semibold text-ink-muted">
              {match.is_home ? "Home" : "Away"}
            </span>
          </div>
          <p className="truncate font-bold">
            {home} <span className="font-medium text-ink-muted">vs</span> {away}
          </p>
          <p className="text-xs text-ink-muted">
            {score ? (
              <span className="tabular font-bold text-ink">FT {score}</span>
            ) : (
              <LocalTime iso={match.kickoff_at} withDate={false} />
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {started ? (
            <Badge tone="neutral">{hasTeam ? "Locked" : "No team"}</Badge>
          ) : (
            <Badge tone={hasTeam ? "gold" : "garnet"}>{hasTeam ? "Edit XI" : "Pick XI"}</Badge>
          )}
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 text-ink-muted transition group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
        </div>
      </Card>
    </Link>
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const [user, { welcome }] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createClient();
  const [{ upcoming, recent }, teams] = await Promise.all([
    listMatches(supabase),
    supabase.from("fantasy_teams").select("match_id").eq("user_id", user.id),
  ]);
  const myMatches = new Set((teams.data ?? []).map((t) => Number(t.match_id)));

  return (
    <>
      <PageTitle subtitle="Teams lock at kickoff. Points land after full time.">Matches</PageTitle>
      {welcome && (
        <div className="mb-5">
          <Notice tone="success">
            Welcome, <strong>{user.profile?.display_name}</strong>! You&apos;re in the Global
            league.{" "}
            <Link href="/join" className="underline">
              Change your name or add an invite code
            </Link>
            .
          </Notice>
        </div>
      )}

      <section className="space-y-2.5">
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length === 0 && (
          <Notice>No upcoming matches yet. An admin needs to sync fixtures.</Notice>
        )}
        {upcoming.map((m) => (
          <MatchCard key={m.id} match={m} hasTeam={myMatches.has(m.id)} />
        ))}
      </section>

      {recent.length > 0 && (
        <section className="mt-8 space-y-2.5">
          <SectionTitle>Recent</SectionTitle>
          {recent.map((m) => (
            <MatchCard key={m.id} match={m} hasTeam={myMatches.has(m.id)} />
          ))}
        </section>
      )}
    </>
  );
}
