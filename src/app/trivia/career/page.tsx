import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { careerTable, getCareer } from "@/features/career/server";
import { triviaDay } from "@/features/trivia/game";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { TriviaTabs } from "../tabs";
import { CareerPath } from "./career-path";

export const metadata: Metadata = { title: "Career Path" };

export default async function CareerPage() {
  preconnect("https://flagcdn.com");
  preconnect("https://commons.wikimedia.org");
  const user = await requireUser();
  const day = triviaDay();
  const supabase = await createClient();

  const [game, table, league] = await Promise.all([
    getCareer(createAdminClient(), user.id, day),
    careerTable(supabase, day),
    getMyLeague(supabase, user.id),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.userId === user.id || names.has(r.userId))
    .sort((a, b) => Number(b.solved) - Number(a.solved) || a.tries - b.tries);

  return (
    <div>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="Whose career is this? Name the player in 5 guesses. Each miss unlocks a hint."
      >
        Career Path
      </PageTitle>
      <TriviaTabs active="/trivia/career" />

      {game ? (
        <CareerPath initial={game} />
      ) : (
        <Notice>No Career Path today yet — the career data hasn&apos;t been imported.</Notice>
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
