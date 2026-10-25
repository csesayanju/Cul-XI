import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { Card, Notice } from "@/components/ui";
import { Wordmark } from "@/components/wordmark";
import { getSessionUser } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  "missing-code": "That sign-in link was incomplete. Request a new one.",
  "link-expired": "That sign-in link has expired or was already used. Request a new one.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signin?: string }>;
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);

  if (user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-black">Hola, {user.profile?.display_name ?? "culé"} 👋</h1>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/matches">
            <Card className="h-full transition hover:border-accent">
              <p className="font-bold">Pick your XI</p>
              <p className="text-sm text-ink-muted">Build a team for the next Barça match.</p>
            </Card>
          </Link>
          <Link href="/leaderboard">
            <Card className="h-full transition hover:border-accent">
              <p className="font-bold">Leaderboard</p>
              <p className="text-sm text-ink-muted">See how you stack up against friends.</p>
            </Card>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-blaugrana-700 to-garnet-700 p-6 text-white shadow-lg">
        <Wordmark className="text-4xl" />
        <p className="mt-3 text-lg font-semibold">Fantasy football for every Barça match.</p>
        <ul className="mt-3 space-y-1 text-sm opacity-90">
          <li>⚽ Pick 11 from Barça and their opponent</li>
          <li>💰 100 credits, max 7 from one team</li>
          <li>🎖️ Captain scores double</li>
          <li>🏆 Beat your friends, match by match</li>
        </ul>
      </section>

      <Card>
        <h2 className="mb-3 text-lg font-bold">Sign in</h2>
        {params.error && ERRORS[params.error] && (
          <div className="mb-3">
            <Notice tone="error">{ERRORS[params.error]}</Notice>
          </div>
        )}
        {params.signin && (
          <div className="mb-3">
            <Notice>Please sign in to continue.</Notice>
          </div>
        )}
        <LoginForm />
        <p className="mt-3 text-xs text-ink-muted">
          No password needed. Invite-only — you&apos;ll need the group&apos;s invite code after
          signing in.
        </p>
      </Card>
    </div>
  );
}
