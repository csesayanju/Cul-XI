import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { getMystery, mysteryTable } from "@/features/mystery/server";
import { triviaDay } from "@/features/trivia/game";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { GAME_PAGE } from "../layout-classes";
import { TriviaTabs } from "../tabs";
import { Mystery } from "./mystery";

export const metadata: Metadata = { title: "Mystery Player" };

export default async function MysteryPage() {
  preconnect("https://flagcdn.com");
  const user = await requireUser();
  const day = triviaDay();
  const supabase = await createClient();
  const [game, table, league] = await Promise.all([
    getMystery(createAdminClient(), user.id, day),
    mysteryTable(supabase, day),
    getMyLeague(supabase, user.id),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.userId === user.id || names.has(r.userId))
    .sort((a, b) => Number(b.solved) - Number(a.solved) || a.tries - b.tries);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Guess today's hidden La Liga player. Every guess shows how close you are: nation, position, age, clubs in common and Barça. 8 guesses."
      >
        Mystery Player
      </PageTitle>
      <TriviaTabs active="/trivia/mystery" />
      {game ? <Mystery initial={game} /> : <Notice>No mystery player today yet.</Notice>}

      <section className="mt-8">
        <SectionTitle>Today&apos;s table</SectionTitle>
        <Card className="p-0">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-ink-muted">Nobody has played today yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {rows.map((r) => (
                <li
                  key={r.userId}
                  className={cx(
                    "flex justify-between p-3",
                    r.userId === user.id && "bg-gold-400/10",
                  )}
                >
                  <span className="font-medium">
                    {r.userId === user.id ? "You" : names.get(r.userId)}
                  </span>
                  <span className="tabular font-bold">
                    {r.solved ? `✅ in ${r.tries}` : r.finished ? "❌" : "playing"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
