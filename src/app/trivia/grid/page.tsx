import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { getTtt, tttTable } from "@/features/tiki-taka-toe/server";
import { triviaDay } from "@/features/trivia/game";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { TriviaTabs } from "../tabs";
import { TikiTakaToe } from "./tiki-taka-toe";

export const metadata: Metadata = { title: "Tiki-Taka-Toe" };

export default async function GridPage() {
  preconnect("https://flagcdn.com");
  const user = await requireUser();
  const day = triviaDay();
  const supabase = await createClient();

  // The grid (with example answers) is read with the service role; the table uses RLS.
  const [game, table, league] = await Promise.all([
    getTtt(createAdminClient(), user.id, day),
    tttTable(supabase, day),
    getMyLeague(supabase, user.id),
  ]);

  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.user_id === user.id || names.has(r.user_id))
    .sort((a, b) => b.filled - a.filled || b.guesses_left - a.guesses_left);

  return (
    <div>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Fill each square with a Barça player who fits both its row and its column. 9 guesses, each player once."
      >
        Tiki-Taka-Toe
      </PageTitle>
      <TriviaTabs active="/trivia/grid" />

      {game ? (
        <TikiTakaToe initial={game} />
      ) : (
        <Notice>
          No grid today yet — an admin needs to import the player repository on /admin/trivia.
        </Notice>
      )}

      <section className="mt-8">
        <SectionTitle>Today&apos;s table</SectionTitle>
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
                    r.user_id === user.id && "bg-gold-400/10",
                  )}
                >
                  <span className="font-medium">
                    {r.user_id === user.id ? "You" : names.get(r.user_id)}
                  </span>
                  <span className="tabular font-bold">
                    {r.filled}/9 {r.finished ? "" : "· playing"}
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
