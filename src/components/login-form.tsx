"use client";

import { useActionState } from "react";

import { signInAsGuest, signInWithGoogle, signInWithMagicLink } from "@/app/actions/auth";
import type { AuthMethods } from "@/lib/supabase/auth-methods";

import { Button, Input, Notice } from "./ui";

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * One tap to play: guest (instant, auto name) or Google; email links tucked away for those
 * who want them. Everyone lands in the Global league, invite codes are optional.
 */
export function LoginForm({ methods }: { methods: AuthMethods }) {
  const [emailState, emailAction, emailPending] = useActionState(signInWithMagicLink, null);
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogle, null);
  const [guestState, guestAction, guestPending] = useActionState(signInAsGuest, null);
  const busy = emailPending || googlePending || guestPending;

  return (
    <div className="space-y-3">
      {methods.guest && (
        <form action={guestAction}>
          <Button type="submit" disabled={busy} className="min-h-13 w-full text-base">
            {guestPending ? "Kicking off…" : "⚽ Play now"}
          </Button>
          <p className="mt-1.5 text-center text-xs text-ink-muted">
            No sign-up. You get a football name, change it any time.
          </p>
          {guestState && !guestState.ok && <Notice tone="error">{guestState.message}</Notice>}
        </form>
      )}

      {methods.google && (
        <form action={googleAction}>
          <Button
            type="submit"
            variant={methods.guest ? "ghost" : "primary"}
            disabled={busy}
            className="w-full gap-2"
          >
            <GoogleMark />
            {googlePending ? "Opening Google…" : "Continue with Google"}
          </Button>
          {googleState && !googleState.ok && <Notice tone="error">{googleState.message}</Notice>}
        </form>
      )}

      <details className="group rounded-xl" open={!methods.guest && !methods.google}>
        <summary className="cursor-pointer list-none py-1 text-center text-sm font-semibold text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          Use email instead <span className="inline-block transition group-open:rotate-180">⌄</span>
        </summary>
        <form action={emailAction} className="mt-2 space-y-2">
          <label className="sr-only" htmlFor="email">
            Email
          </label>
          <div className="flex gap-2">
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
            <Button type="submit" variant="secondary" disabled={busy} className="shrink-0">
              {emailPending ? "Sending…" : "Send link"}
            </Button>
          </div>
          {emailState && (
            <Notice tone={emailState.ok ? "success" : "error"}>{emailState.message}</Notice>
          )}
        </form>
      </details>
    </div>
  );
}
