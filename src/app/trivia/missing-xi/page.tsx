import type { Metadata } from "next";
import { preconnect } from "react-dom";

import { Card, cx, Notice, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { getXi, xiTable } from "@/features/missing-xi/server";
import { triviaDay } from "@/features/trivia/game";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { TriviaTabs } from "../tabs";
import { MissingXi } from "./missing-xi";

export const metadata: Metadata = { title: "Missing XI" };

export default async function MissingXiPage() {
  preconnect("https://flagcdn.com");
  const user = await requireUser();
  const day = triviaDay();
  const supabase = await createClient();
  const [game, table, league] = await Promise.all([
    getXi(createAdminClient(), user.id, day),
    xiTable(supabase, day),
    getMyLeague(supabase, user.id),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.user_id === user.id || names.has(r.user_id))
    .sort((a, b) => b.found - a.found || b.lives_left - a.lives_left);

  return (
    <div>
      <PageTitle
        eyebrow="Daily trivia"
        subtitle="A famous European final. Name the starting XI from the shirt numbers and flags. 5 lives."
      >
        Missing XI
      </PageTitle>
      <TriviaTabs active="/trivia/missing-xi" />
      {game ? <MissingXi initial={game} /> : <Notice>No line-up today yet.</Notice>}

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
                    {r.found}/11 {r.finished ? "" : "· playing"}
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
