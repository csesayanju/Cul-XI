import type { Metadata } from "next";

import { Card, cx, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeague } from "@/features/fantasy/queries";
import { getOoo, oooTable } from "@/features/odd-one-out/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { TriviaTabs } from "../tabs";
import { OddOneOut } from "./odd-one-out";

export const metadata: Metadata = { title: "Odd One Out" };

export default async function OddOneOutPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const [game, table, league] = await Promise.all([
    getOoo(createAdminClient(), user.id),
    oooTable(supabase),
    getMyLeague(supabase, user.id),
  ]);
  const names = league?.members ?? new Map<string, string>();
  const rows = table
    .filter((r) => r.best > 0 && (r.user_id === user.id || names.has(r.user_id)))
    .sort((a, b) => b.best - a.best)
    .slice(0, 20);

  return (
    <div>
      <PageTitle
        eyebrow="Endless trivia"
        subtitle="Three of them share something. Spot the one who doesn't — and keep the streak going."
      >
        Odd One Out
      </PageTitle>
      <TriviaTabs active="/trivia/odd-one-out" />
      <OddOneOut initial={game} />

      <section className="mt-8">
        <SectionTitle>Best streaks</SectionTitle>
        <Card className="p-0">
          {rows.length === 0 ? (
            <p className="p-3 text-sm text-ink-muted">No streaks yet. Be the first!</p>
          ) : (
            <ol className="divide-y divide-line text-sm">
              {rows.map((r, i) => (
                <li
                  key={r.user_id}
                  className={cx(
                    "flex justify-between p-3",
                    r.user_id === user.id && "bg-gold-400/10",
                  )}
                >
                  <span className="font-medium">
                    <span className="tabular mr-2 text-ink-muted">{i + 1}</span>
                    {r.user_id === user.id ? "You" : names.get(r.user_id)}
                  </span>
                  <span className="tabular font-black">{r.best}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </section>
    </div>
  );
}
