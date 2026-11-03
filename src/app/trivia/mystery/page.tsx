import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getMystery } from "@/features/mystery/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { Mystery } from "./mystery";

export const metadata: Metadata = { title: "Mystery Player" };

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
    getMystery(admin, user.id, day),
    archiveStatus(admin, "mystery", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Guess the hidden La Liga player. Every guess shows how close you are: nation, position, age, clubs in common and Barça. 8 guesses."
      >
        Mystery Player
      </PageTitle>
      <TriviaTabs active="/trivia/mystery" />
      <div>
        <ArchiveBar path="/trivia/mystery" day={day} today={today} days={archive} />
        {game ? (
          <Mystery
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No mystery player for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="mystery"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/mystery"
        day={practice ? day : undefined}
      />
    </div>
  );
}
