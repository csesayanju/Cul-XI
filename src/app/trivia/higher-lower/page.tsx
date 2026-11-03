import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Notice, PageTitle } from "@/components/ui";
import { getHol } from "@/features/higher-lower/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { HigherLower } from "./higher-lower";

export const metadata: Metadata = { title: "Higher or Lower" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<TriviaSearchParams>;
}) {
  preconnect("https://flagcdn.com");
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const { today, period, league } = triviaParams(sp);
  const game = await getHol(createAdminClient(), user.id);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Endless trivia"
        subtitle="Did they score more or fewer La Liga goals? Keep the streak alive. Legends with 100+ goals."
      >
        Higher or Lower
      </PageTitle>
      <TriviaTabs active="/trivia/higher-lower" />
      <div>{game ? <HigherLower initial={game} /> : <Notice>Not enough data yet.</Notice>}</div>
      <TriviaBoard
        game="higher-lower"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/higher-lower"
      />
    </div>
  );
}
