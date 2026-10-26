import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LocalTime } from "@/components/local-time";
import { PlayerAvatar } from "@/components/player-avatar";
import { Badge, Card, Notice, PageTitle } from "@/components/ui";
import { Pitch, pitchName } from "@/features/fantasy/components/pitch";
import { COMPETITION_LABELS, SCORE_LABELS } from "@/features/fantasy/labels";
import { getMatch, getMyTeam, listMatchPlayers } from "@/features/fantasy/queries";
import { POSITIONS, type Position } from "@/features/fantasy/types";
import type { FantasyPointsBreakdown } from "@/features/fantasy/scoring/score-fantasy-team";
import { requireUser } from "@/lib/auth";
import { hasKickedOff } from "@/lib/time";
import { serverEnv } from "@/lib/env/server";
import { createClient } from "@/lib/supabase/server";

import { TeamBuilder } from "./team-builder";

export const metadata: Metadata = { title: "Pick your XI" };

export default async function PickPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const matchId = Number.parseInt(id, 10);
  if (!Number.isFinite(matchId)) notFound();

  const user = await requireUser();
  const supabase = await createClient();
  const match = await getMatch(supabase, matchId);
  if (!match) notFound();

  const [players, team, points] = await Promise.all([
    listMatchPlayers(supabase, matchId),
    getMyTeam(supabase, user.id, matchId),
    supabase
      .from("fantasy_points")
      .select("total_points, breakdown")
      .eq("user_id", user.id)
      .eq("match_id", matchId)
      .maybeSingle(),
  ]);

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

  // After kickoff: read-only team and (once calculated) points breakdown.
  const byId = new Map(players.map((p) => [p.id, p]));
  const breakdown = points.data?.breakdown as FantasyPointsBreakdown | undefined;
  const scoreById = new Map(breakdown?.players.map((p) => [p.playerId, p]) ?? []);

  return (
    <>
      {header}
      {!team ? (
        <Notice>You didn&apos;t pick a team for this match.</Notice>
      ) : (
        <div className="space-y-3">
          <Card className="flex items-center justify-between">
            <span className="font-semibold">Your points</span>
            <span className="text-2xl font-black">
              {points.data ? Number(points.data.total_points) : "—"}
            </span>
          </Card>
          {!points.data && <Notice>Teams are locked. Points arrive after full time.</Notice>}
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
                  team.picks
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
            {team.picks.map((pick) => {
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
    </>
  );
}
