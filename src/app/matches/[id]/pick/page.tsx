import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalTime } from "@/components/local-time";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge, Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { Pitch, pitchName } from "@/features/fantasy/components/pitch";
import { COMPETITION_LABELS, SCORE_LABELS } from "@/features/fantasy/labels";
import { getMatch, getMyTeam, listMatchPlayers } from "@/features/fantasy/queries";
import { POSITIONS, type Position } from "@/features/fantasy/types";
import type { FantasyPointsBreakdown } from "@/features/fantasy/scoring/score-fantasy-team";
import { freshenMatch } from "@/features/fantasy/sync/on-demand";
import { requireUser } from "@/lib/auth";
import { hasKickedOff } from "@/lib/time";
import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { TeamBuilder } from "./team-builder";

export const metadata: Metadata = { title: "Pick your XI" };

export default async function PickPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ user?: string }>;
}) {
  const [{ id }, { user: viewParam }] = await Promise.all([params, searchParams]);
  const matchId = Number.parseInt(id, 10);
  if (!Number.isFinite(matchId)) notFound();

  // Around kickoff, fetch line-ups if they're out (GitHub's schedule can be late).
  const [user] = await Promise.all([requireUser(), freshenMatch(matchId)]);
  const supabase = await createClient();
  // One parallel round of queries (the match isn't needed to start the others).
  const [match, players, team, points] = await Promise.all([
    getMatch(supabase, matchId),
    listMatchPlayers(supabase, matchId),
    getMyTeam(supabase, user.id, matchId),
    supabase
      .from("fantasy_points")
      .select("user_id, total_points, breakdown")
      .eq("match_id", matchId),
  ]);
  if (!match) notFound();

  const barcaTeamId = serverEnv().BARCA_TEAM_ID;
  const started = hasKickedOff(match.kickoff_at);
  const title = match.is_home
    ? `Barça vs ${match.opponent_name}`
    : `${match.opponent_name} vs Barça`;

  const header = (
    <PageTitle
      subtitle={
        <>
          {COMPETITION_LABELS[match.competition]} · <LocalTime iso={match.kickoff_at} />
        </>
      }
    >
      {title}
    </PageTitle>
  );

  if (!started) {
    return (
      <>
        {header}
        <TeamBuilder
          matchId={matchId}
          barcaTeamId={barcaTeamId}
          opponentName={match.opponent_name}
          kickoffAt={match.kickoff_at}
          players={players}
          initial={{
            playerIds: team?.picks.map((p) => p.playerId) ?? [],
            captainId: team?.picks.find((p) => p.isCaptain)?.playerId ?? null,
            viceCaptainId: team?.picks.find((p) => p.isViceCaptain)?.playerId ?? null,
          }}
        />
      </>
    );
  }

  // After kickoff: teams are locked. Everyone's teams in your leagues become visible (RLS),
  // so you can look at yours or any league-mate's, with points once calculated.
  const byId = new Map(players.map((p) => [p.id, p]));
  const { data: teamRows } = await supabase
    .from("fantasy_teams")
    .select("user_id, profiles(display_name), fantasy_team_players(player_id, is_captain)")
    .eq("match_id", matchId);
  const pointsByUser = new Map(
    (points.data ?? []).map((r) => [
      r.user_id as string,
      { total: Number(r.total_points), breakdown: r.breakdown as FantasyPointsBreakdown },
    ]),
  );
  const teams = (
    (teamRows ?? []) as unknown as {
      user_id: string;
      profiles: { display_name: string } | null;
      fantasy_team_players: { player_id: number; is_captain: boolean }[];
    }[]
  )
    .map((t) => ({
      userId: t.user_id,
      name: t.user_id === user.id ? "You" : (t.profiles?.display_name ?? "Player"),
      points: pointsByUser.get(t.user_id)?.total ?? null,
      captain: byId.get(Number(t.fantasy_team_players.find((x) => x.is_captain)?.player_id))?.name,
    }))
    .sort(
      (a, b) =>
        (b.points ?? -1) - (a.points ?? -1) ||
        Number(b.userId === user.id) - Number(a.userId === user.id) ||
        a.name.localeCompare(b.name),
    );

  const viewing = teams.find((t) => t.userId === viewParam) ?? null;
  const viewId = viewing?.userId ?? user.id;
  const mine = viewId === user.id;
  const shown = mine ? team : await getMyTeam(supabase, viewId, matchId);
  const shownPoints = pointsByUser.get(viewId);
  const breakdown = shownPoints?.breakdown;
  const scoreById = new Map(breakdown?.players.map((p) => [p.playerId, p]) ?? []);

  const leagueTeams = (
    <section className="mt-8">
      <SectionTitle aside={`${teams.length} ${teams.length === 1 ? "team" : "teams"}`}>
        League teams
      </SectionTitle>
      {teams.length === 0 ? (
        <Notice>Nobody in your leagues picked a team for this match.</Notice>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {teams.map((t, i) => (
              <li key={t.userId}>
                <Link
                  href={`/matches/${matchId}/pick${t.userId === user.id ? "" : `?user=${t.userId}`}`}
                  scroll={false}
                  aria-current={t.userId === viewId ? "true" : undefined}
                  className={cx(
                    "flex items-center gap-3 p-3 transition-colors hover:bg-line/30",
                    t.userId === viewId && "bg-gold-400/10",
                  )}
                >
                  <span className="tabular w-5 text-center font-bold text-ink-muted">
                    {t.points == null ? "–" : i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{t.name}</span>
                    {t.captain && (
                      <span className="block truncate text-xs text-ink-muted">
                        Captain: {t.captain}
                      </span>
                    )}
                  </span>
                  <span className="tabular font-black">{t.points ?? "—"}</span>
                  <span aria-hidden className="text-ink-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );

  return (
    <>
      {header}
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 py-2 text-sm">
        <span aria-hidden>🔒</span>
        <span className="text-ink-muted">
          Teams locked at kickoff.{" "}
          {pointsByUser.size === 0 ? "Points arrive after full time." : "Points are in."}
        </span>
      </div>
      {!shown ? (
        <Notice>
          {mine
            ? "You didn't pick a team for this match."
            : `${viewing?.name ?? "They"} didn't pick a team.`}
        </Notice>
      ) : (
        <div className="space-y-3">
          <Card className="flex items-center justify-between">
            <span className="font-semibold">
              {mine ? "Your points" : `${viewing?.name}'s points`}
            </span>
            <span className="text-2xl font-black">{shownPoints ? shownPoints.total : "—"}</span>
          </Card>
          {breakdown && !breakdown.valid && (
            <Notice tone="error">
              This team broke the rules and scored 0:{" "}
              {breakdown.errors?.map((e) => e.message).join(" ")}
            </Notice>
          )}
          <Pitch
            rows={
              Object.fromEntries(
                POSITIONS.map((pos) => [
                  pos,
                  shown.picks
                    .filter((pick) => byId.get(pick.playerId)?.position === pos)
                    .map((pick) => {
                      const p = byId.get(pick.playerId)!;
                      const score = scoreById.get(pick.playerId);
                      const role = pick.isCaptain ? "C" : pick.isViceCaptain ? "VC" : null;
                      return (
                        <div
                          key={pick.playerId}
                          className="flex w-16 flex-col items-center gap-0.5"
                        >
                          <span className="relative">
                            <PlayerAvatar
                              name={p.name}
                              photoUrl={p.photoUrl}
                              barca={p.teamId === barcaTeamId}
                            />
                            {role && (
                              <span className="absolute -top-1 -right-2 rounded-full bg-gold-400 px-1 text-[10px] font-black text-blaugrana-950 ring-1 ring-white">
                                {role}
                              </span>
                            )}
                          </span>
                          <span className="max-w-full truncate rounded bg-white px-1 text-[11px] font-semibold text-blaugrana-950">
                            {pitchName(p.name)}
                          </span>
                          <span className="rounded bg-garnet-500 px-1.5 text-[11px] font-black text-white">
                            {score ? score.points : "–"}
                          </span>
                        </div>
                      );
                    }),
                ]),
              ) as Record<Position, React.ReactNode[]>
            }
          />
          <h2 className="pt-2 text-sm font-semibold tracking-wide text-ink-muted uppercase">
            Breakdown
          </h2>
          <ul className="space-y-2">
            {shown.picks.map((pick) => {
              const p = byId.get(pick.playerId);
              const score = scoreById.get(pick.playerId);
              return (
                <li key={pick.playerId}>
                  <Card className="p-3">
                    <div className="flex items-center gap-3">
                      <PlayerAvatar
                        name={p?.name ?? "?"}
                        photoUrl={p?.photoUrl}
                        barca={p?.teamId === barcaTeamId}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {p?.name ?? score?.name ?? "Unknown"}{" "}
                          {pick.isCaptain && <Badge tone="gold">C</Badge>}
                          {pick.isViceCaptain && <Badge tone="neutral">VC</Badge>}
                        </p>
                        {score && score.breakdown.length > 0 && (
                          <p className="text-xs text-ink-muted">
                            {score.breakdown
                              .map(
                                (l) =>
                                  `${SCORE_LABELS[l.key] ?? l.key} ${l.points > 0 ? "+" : ""}${l.points}`,
                              )
                              .join(" · ")}
                            {score.multiplier !== 1 && ` · ×${score.multiplier}`}
                          </p>
                        )}
                      </div>
                      <span className="font-bold">{score ? score.points : "–"}</span>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {leagueTeams}
    </>
  );
}
