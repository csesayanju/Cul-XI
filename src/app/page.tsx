import Link from "next/link";

import { InstallApp } from "@/components/install-app";
import { LoginForm } from "@/components/login-form";
import { LocalTime } from "@/components/local-time";
import { Card, Notice, Sticker, Tile } from "@/components/ui";
import { Wordmark } from "@/components/wordmark";
import { COMPETITION_LABELS } from "@/features/fantasy/labels";
import { loadDashboard } from "@/features/home/dashboard";
import { getSessionUser } from "@/lib/auth";
import { FULL_MESSAGE } from "@/lib/seat-limit";
import { getAuthMethods } from "@/lib/supabase/auth-methods";
import { createClient } from "@/lib/supabase/server";

const ERRORS: Record<string, string> = {
  "missing-code": "That sign-in link was incomplete. Request a new one.",
  "link-expired": "That sign-in link has expired or was already used. Request a new one.",
  oauth: "Sign-in was cancelled or failed. Please try again.",
  full: FULL_MESSAGE,
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; signin?: string }>;
}) {
  const [user, params, methods] = await Promise.all([
    getSessionUser(),
    searchParams,
    getAuthMethods(),
  ]);

  if (user) {
    const dash = await loadDashboard(await createClient(), user.id);
    const name = user.profile?.display_name ?? "culé";
    const { next, rank, trivia } = dash;
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink-muted">Hola 👋</p>
            <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight">
              {name}
            </h1>
            <Link href="/join" className="mt-1 inline-block text-xs text-ink-muted underline">
              Change name or join a league
            </Link>
          </div>
          {trivia.streak > 0 && (
            <Sticker tone="gold" tilt={6} className="animate-float [--tilt:6deg]">
              🔥 {trivia.streak}-day streak
            </Sticker>
          )}
        </div>

        {user.isAnonymous && (
          <Notice>
            Guest account: it lives in this browser only. Sign in with Google to keep your teams.
          </Notice>
        )}
        <InstallApp />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Hero: the next (or live) match. */}
          <Link href={next ? `/matches/${next.id}/pick` : "/matches"} className="group col-span-2">
            <Tile hero className="flex min-h-44 flex-col justify-between">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-garnet-500/25 blur-3xl"
              />
              <div className="relative flex items-center justify-between gap-2">
                <span className="text-xs font-bold tracking-[0.14em] text-accent uppercase">
                  {next ? (next.live ? "Live now" : "Next up") : "Fantasy"}
                </span>
                {next?.live ? (
                  <Sticker tone="volt" tilt={3}>
                    ● Live
                  </Sticker>
                ) : next && !next.hasTeam ? (
                  <Sticker tone="garnet" tilt={3}>
                    Pick your XI
                  </Sticker>
                ) : next ? (
                  <Sticker tone="gold" tilt={3}>
                    ✓ Locked in
                  </Sticker>
                ) : null}
              </div>
              <div className="relative">
                <p className="font-display text-3xl leading-tight font-extrabold tracking-tight text-balance">
                  {next ? next.title : "No match scheduled"}
                </p>
                {next && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {COMPETITION_LABELS[next.competition as keyof typeof COMPETITION_LABELS]} ·{" "}
                    <LocalTime iso={next.kickoffAt} />
                  </p>
                )}
              </div>
            </Tile>
          </Link>

          <Link href="/leaderboard" className="group">
            <Tile className="flex h-full min-h-36 flex-col justify-between">
              <span className="text-xs font-bold tracking-wide text-ink-muted uppercase">
                🏆 {rank?.league ?? "Table"}
              </span>
              <div>
                <p className="tabular font-display text-4xl leading-none font-extrabold">
                  {rank ? `#${rank.position}` : "–"}
                  {rank && (
                    <span className="text-base font-semibold text-ink-muted"> / {rank.of}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {rank ? `${rank.points} pts` : "Join a league"}
                </p>
              </div>
            </Tile>
          </Link>

          <Link href="/trivia" className="group">
            <Tile className="flex h-full min-h-36 flex-col justify-between border-transparent bg-gradient-to-br from-blaugrana-700 to-blaugrana-950 text-white">
              <span className="text-xs font-bold tracking-wide text-white/70 uppercase">
                🧠 Daily trivia
              </span>
              <div>
                <p className="tabular font-display text-4xl leading-none font-extrabold">
                  {trivia.played}
                  <span className="text-base font-semibold text-white/60">/{trivia.total}</span>
                </p>
                <p className="mt-1 text-xs text-white/70">
                  {trivia.played === trivia.total
                    ? "All done today. W 🏆"
                    : trivia.played === 0
                      ? "Fresh games waiting"
                      : "Keep going 🔥"}
                </p>
              </div>
            </Tile>
          </Link>

          <Link href="/trivia/higher-lower" className="group">
            <Tile className="flex h-full min-h-28 flex-col justify-between">
              <span aria-hidden className="text-2xl">
                📈
              </span>
              <p className="font-display text-lg leading-tight font-extrabold">Higher or Lower</p>
            </Tile>
          </Link>
          <Link href="/trivia/mystery" className="group">
            <Tile className="flex h-full min-h-28 flex-col justify-between">
              <span aria-hidden className="text-2xl">
                ❓
              </span>
              <p className="font-display text-lg leading-tight font-extrabold">Mystery Player</p>
            </Tile>
          </Link>
          <Link href="/matches/rules" className="group col-span-2 sm:col-span-1">
            <Tile className="flex h-full min-h-28 flex-col justify-between">
              <span aria-hidden className="text-2xl">
                📖
              </span>
              <p className="font-display text-lg leading-tight font-extrabold">How points work</p>
            </Tile>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 lg:grid lg:grid-cols-2 lg:items-center lg:gap-10 lg:space-y-0 lg:pt-6">
      <section className="glow relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-700 p-6 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -bottom-20 size-64 rounded-full bg-gold-500/25 blur-3xl"
        />
        <Sticker
          tone="volt"
          tilt={8}
          className="absolute top-5 right-5 animate-float [--tilt:8deg]"
        >
          Free to play
        </Sticker>
        <Wordmark className="font-display text-5xl" />
        <p className="mt-4 font-display text-3xl leading-tight font-extrabold text-balance">
          Your Barça. <span className="text-gradient">Your XI.</span> Your bragging rights.
        </p>
        <p className="mt-2 text-sm text-white/80">
          Fantasy football for every Barça match, plus daily football trivia.
        </p>
        <ul className="mt-3 space-y-1 text-sm opacity-90">
          <li>⚽ Pick 11 from Barça and their opponent</li>
          <li>💰 100 credits, max 7 from one team</li>
          <li>🎖️ Captain scores double</li>
          <li>🏆 Beat your friends, match by match</li>
          <li>🧠 Daily trivia: Culé Ten, Tiki-Taka-Toe and more</li>
        </ul>
      </section>

      <Card>
        <h2 className="mb-3 text-center font-display text-2xl font-extrabold">Jump in ⚽</h2>
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
        <LoginForm methods={methods} />
        <p className="mt-3 text-center text-xs text-ink-muted">
          You start in the Global league. Got an invite code from friends? Add it later.
        </p>
      </Card>
    </div>
  );
}
