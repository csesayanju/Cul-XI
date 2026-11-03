import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { PageTitle } from "@/components/ui";
import { getOoo } from "@/features/odd-one-out/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

import { GAME_PAGE } from "../layout-classes";
import { triviaParams, type TriviaSearchParams } from "../params";
import { TriviaTabs } from "../tabs";
import { TriviaBoard } from "../trivia-board";
import { OddOneOut } from "./odd-one-out";

export const metadata: Metadata = { title: "Odd One Out" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<TriviaSearchParams>;
}) {
  preconnect("https://flagcdn.com");
  const [user, sp] = await Promise.all([requireUser(), searchParams]);
  const { today, period, league } = triviaParams(sp);
  const game = await getOoo(createAdminClient(), user.id);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Endless trivia"
        subtitle="Three of them share something. Spot the one who doesn't — and keep the streak going."
      >
        Odd One Out
      </PageTitle>
      <TriviaTabs active="/trivia/odd-one-out" />
      <div>
        <OddOneOut initial={game} />
      </div>
      <TriviaBoard
        game="odd-one-out"
        userId={user.id}
        today={today}
        period={period}
        leagueId={league}
        path="/trivia/odd-one-out"
      />
    </div>
  );
}
