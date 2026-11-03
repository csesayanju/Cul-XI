import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getCareer } from "@/features/career/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { CareerPath } from "./career-path";

export const metadata: Metadata = { title: "Career Path" };

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
    getCareer(admin, user.id, day),
    archiveStatus(admin, "career", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Whose career is this? Name the player in 5 guesses. Each miss unlocks a hint."
      >
        Career Path
      </PageTitle>
      <TriviaTabs active="/trivia/career" />
      <div>
        <ArchiveBar path="/trivia/career" day={day} today={today} days={archive} />
        {game ? (
          <CareerPath
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No Career Path for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="career"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/career"
        day={practice ? day : undefined}
      />
    </div>
  );
}
