import type { Metadata } from "next";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getSeasonGame } from "@/features/which-season/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { WhichSeason } from "./which-season";

export const metadata: Metadata = { title: "Which Season?" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<TriviaSearchParams>;
}) {
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const { today, day, practice, period, league } = triviaParams(sp);
  const admin = createAdminClient();

  // The game (answers) is resolved with the service role; archive days are generated on demand.
  const [game, archive] = await Promise.all([
    getSeasonGame(admin, user.id, day),
    archiveStatus(admin, "season", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="A Barça season, one clue at a time. Name it in 6 guesses — each miss tells you earlier or later."
      >
        Which Season?
      </PageTitle>
      <TriviaTabs active="/trivia/season" />
      <div>
        <ArchiveBar path="/trivia/season" day={day} today={today} days={archive} />
        {game ? (
          <WhichSeason
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No season to guess for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="season"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/season"
        day={practice ? day : undefined}
      />
    </div>
  );
}
