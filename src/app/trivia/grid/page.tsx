import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { archiveStatus } from "@/features/boards/server";
import { getTtt } from "@/features/tiki-taka-toe/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { ArchiveBar } from "../archive-bar";
import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { TikiTakaToe } from "./tiki-taka-toe";

export const metadata: Metadata = { title: "Tiki-Taka-Toe" };

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
    getTtt(admin, user.id, day),
    archiveStatus(admin, "grid", user.id, today),
  ]);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Fill each square with a player who fits both its row and its column: clubs from across La Liga, nations and trophies. 9 guesses, each player once."
      >
        Tiki-Taka-Toe
      </PageTitle>
      <TriviaTabs active="/trivia/grid" />
      <div>
        <ArchiveBar path="/trivia/grid" day={day} today={today} days={archive} />
        {game ? (
          <TikiTakaToe
            key={`${day}:${game.finished}`}
            initial={game}
            archiveDay={practice ? day : undefined}
          />
        ) : (
          <Notice>No grid for this day yet.</Notice>
        )}
      </div>
      <TriviaBoard
        game="grid"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/grid"
        day={practice ? day : undefined}
      />
    </div>
  );
}
