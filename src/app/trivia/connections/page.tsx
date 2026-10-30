import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { connectionsTable, getConnections } from "@/features/connections/server";
import { getMyLeague } from "@/features/fantasy/queries";
import { triviaDay } from "@/features/trivia/game";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { GAME_PAGE } from "../layout-classes";
import { TriviaTabs } from "../tabs";
import { Connections } from "./connections";

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  preconnect("https://flagcdn.com");
  const user = await requireUser();
  const day = triviaDay();
  const supabase = await createClient();
  const [game, table, league] = await Promise.all([
    getConnections(createAdminClient(), user.id, day),
    connectionsTable(supabase, day),
    getMyLeague(supabase, user.id),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.userId === user.id || names.has(r.userId))
    .sort((a, b) => b.groups - a.groups || a.mistakes - b.mistakes);

  return (
    <div className={GAME_PAGE}>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Sixteen players, four hidden groups: a club, a country, a trophy… Four mistakes and you're out."
      >
        Connections
      </PageTitle>
      <TriviaTabs active="/trivia/connections" />
      {game ? <Connections initial={game} /> : <Notice>No puzzle today yet.</Notice>}

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
                    {r.groups}/4 {r.finished ? `· ${r.mistakes} ✗` : "· playing"}
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
