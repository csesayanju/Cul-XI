import type { Metadata } from "next";

import { Card, cx, Notice, PageTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { triviaDay } from "@/features/trivia/game";
import { getGame, leagueTable } from "@/features/trivia/server";
import { requireUser } from "@/lib/auth";
import { trackedLeagues } from "@/lib/highlightly/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { CuleTen } from "./cule-ten";

export const metadata: Metadata = { title: "Culé Ten" };

export default async function TriviaPage() {
  const user = await requireUser();
  const day = triviaDay();
  const t = trackedLeagues();
  const supabase = await createClient();

  // The game (answers) is resolved with the service role; the table uses the user's RLS.
  const [game, table, league] = await Promise.all([
    getGame(createAdminClient(), user.id, day, { barcaTeamId: t.barcaTeamId, season: t.season }),
    leagueTable(supabase, user.id, day),
    getMyLeague(supabase, user.id),
  ]);

  const names = league?.members ?? new Map<string, string>();
  const rows = table.rows
    .filter((r) => r.user_id === user.id || names.has(r.user_id))
    .sort((a, b) => b.found - a.found || b.lives_left - a.lives_left);

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Name the 10 players in today's list. Each slot shows a nationality; 3 wrong guesses and you're out.">
        Culé Ten
      </PageTitle>

      {game ? (
        <CuleTen initial={game} />
      ) : (
        <Notice>
          No list today yet — an admin needs to import the player repository on /admin/trivia.
        </Notice>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Today&apos;s table</h2>
          <span className="text-sm text-ink-muted">Your streak: {table.streak} 🔥</span>
        </div>
        <Card className="p-0">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-ink-muted">Nobody has played today yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {rows.map((r) => (
                <li
                  key={r.user_id}
                  className={cx(
                    "flex justify-between p-3",
                    r.user_id === user.id && "bg-gold-300/20",
                  )}
                >
                  <span>{r.user_id === user.id ? "You" : names.get(r.user_id)}</span>
                  <span className="font-bold">
                    {r.found}/10 {r.finished ? "" : "· playing"}
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
