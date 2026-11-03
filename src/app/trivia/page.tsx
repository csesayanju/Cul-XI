import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getGame } from "@/features/trivia/server";
import { trackedLeagues } from "@/lib/highlightly/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "./archive-bar";
import { GAME_PAGE } from "./layout-classes";
import { triviaParams, type TriviaSearchParams } from "./params";
import { TriviaTabs } from "./tabs";
import { TriviaBoard } from "./trivia-board";
import { CuleTen } from "./cule-ten";

export const metadata: Metadata = { title: "Culé Ten" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<TriviaSearchParams>;
}) {
  preconnect("https://flagcdn.com");
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const { today, day, practice, period, league } = triviaParams(sp);
  const admin = createAdminClient();
  const t = trackedLeagues();

  // The game (answers) is resolved with the service role; archive days are generated on demand.
  const [game, archive] = await Promise.all([
    getGame(admin, user.id, day, { barcaTeamId: t.barcaTeamId, season: t.season }),
    archiveStatus(admin, "cule-ten", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Name the 10 people in today's list, from Barça legends to La Liga records. Each slot shows a nationality; 3 wrong guesses and you're out."
      >
        Culé Ten
      </PageTitle>
      <TriviaTabs active="/trivia" />
      <div>
        <ArchiveBar path="/trivia" day={day} today={today} days={archive} />
        {game ? (
          <CuleTen
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>
            No list for this day yet — an admin needs to import the player repository on
            /admin/trivia.
          </Notice>
        )}
      </div>
      <TriviaBoard
        game="cule-ten"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia"
        day={practice ? day : undefined}
      />
    </div>
  );
}
