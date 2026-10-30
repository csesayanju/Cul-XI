import type { Metadata } from "next";

import { Wordmark } from "@/components/wordmark";

export const metadata: Metadata = { title: "Offline" };
export const dynamic = "force-static";

/** Shown by the service worker when a page can't be loaded without a connection. */
export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <Wordmark className="text-4xl" />
      <h1 className="mt-6 text-2xl font-black">You&apos;re offline</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Culé XI needs a connection for live scores, teams and trivia. Check your signal and try
        again.
      </p>
      <a
        href="/matches"
        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-accent px-5 font-bold text-accent-ink"
      >
        Try again
      </a>
    </div>
  );
}
