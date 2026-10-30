import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageTitle, SectionTitle } from "@/components/ui";
import { getMyLeagues } from "@/features/fantasy/queries";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { JoinForm, LeaveButton, NameForm } from "./join-form";

export const metadata: Metadata = { title: "Your leagues" };

/** Your name, the leagues you're in, and joining a private one with an invite code. */
export default async function JoinPage() {
  const user = await requireUser();
  const leagues = await getMyLeagues(await createClient(), user.id);

  return (
    <div className="space-y-6">
      <PageTitle
        eyebrow="You"
        subtitle="Everyone plays in the Global league. Add a private league with an invite code."
      >
        Your leagues
      </PageTitle>

      <Card>
        <NameForm current={user.profile?.display_name ?? ""} />
        {user.isAnonymous && (
          <p className="mt-2 text-xs text-ink-muted">
            Guest account: it lives in this browser only. Sign in with Google next time to keep your
            teams on every device.
          </p>
        )}
      </Card>

      <section>
        <SectionTitle>Your leagues</SectionTitle>
        <Card className="p-0">
          <ul className="divide-y divide-line text-sm">
            {leagues.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 p-3">
                <Link
                  href={`/leaderboard?league=${l.id}`}
                  className="font-semibold hover:underline"
                >
                  {l.isGlobal ? "🌍 Global" : l.name}
                </Link>
                {l.isGlobal ? (
                  <span className="text-xs text-ink-muted">Everyone</span>
                ) : (
                  <LeaveButton leagueId={l.id} name={l.name} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <SectionTitle>Join a private league</SectionTitle>
        <Card>
          <JoinForm />
        </Card>
      </section>
    </div>
  );
}
