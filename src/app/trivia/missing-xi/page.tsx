import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getXi } from "@/features/missing-xi/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { MissingXi } from "./missing-xi";

export const metadata: Metadata = { title: "Missing XI" };

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
    getXi(admin, user.id, day),
    archiveStatus(admin, "missing-xi", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="A famous European final. Name the starting XI from the shirt numbers and flags. 5 lives."
      >
        Missing XI
      </PageTitle>
      <TriviaTabs active="/trivia/missing-xi" />
      <div>
        <ArchiveBar path="/trivia/missing-xi" day={day} today={today} days={archive} />
        {game ? (
          <MissingXi
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No line-up for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="missing-xi"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/missing-xi"
        day={practice ? day : undefined}
      />
    </div>
  );
}
