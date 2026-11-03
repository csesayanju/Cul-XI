import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getConnections } from "@/features/connections/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { Connections } from "./connections";

export const metadata: Metadata = { title: "Connections" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<TriviaSearchParams>;
}) {
  preconnect("https://flagcdn.com");
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const { today, day, practice, period, league } = triviaParams(sp);
  const admin = createAdminClient();

  // The game (answers) is resolved with the service role; archive days are generated on demand.
  const [game, archive] = await Promise.all([
    getConnections(admin, user.id, day),
    archiveStatus(admin, "connections", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Sixteen players, four hidden groups: a club, a country, a trophy… Four mistakes and you're out."
      >
        Connections
      </PageTitle>
      <TriviaTabs active="/trivia/connections" />
      <div>
        <ArchiveBar path="/trivia/connections" day={day} today={today} days={archive} />
        {game ? (
          <Connections
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No puzzle for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="connections"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/connections"
        day={practice ? day : undefined}
      />
    </div>
  );
}
