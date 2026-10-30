import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { BottomNav, TopNav, type NavItem } from "@/components/app-nav";
import { ServiceWorker } from "@/components/install-app";
import { Wordmark } from "@/components/wordmark";
import { getSessionUser } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Culé XI", template: "%s · Culé XI" },
  description: "Private fantasy football for Barça matches. Free to play, just for friends.",
  robots: { index: false, follow: false },
  applicationName: "Culé XI",
  appleWebApp: { capable: true, title: "Culé XI", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f2f6b" },
    { media: "(prefers-color-scheme: dark)", color: "#060f24" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const nav: NavItem[] = [
    { href: "/matches", label: "Fantasy", icon: "matches" },
    { href: "/leaderboard", label: "Table", icon: "table" },
    { href: "/trivia", label: "Trivia", icon: "trivia" },
    { href: "/rules", label: "Rules", icon: "rules" },
    ...(user?.profile?.is_admin
      ? [{ href: "/admin", label: "Admin", icon: "admin" } as const]
      : []),
  ];

  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <header className="sticky top-0 z-20 bg-brand/95 text-brand-ink shadow-lg shadow-blaugrana-950/20 backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
            <Link href="/" aria-label="Culé XI home" className="transition active:scale-95">
              <Wordmark className="text-xl" />
            </Link>
            {user && (
              <div className="flex items-center gap-2">
                <TopNav items={nav} />
                <form action={signOut}>
                  <button
                    type="submit"
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex size-9 items-center justify-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white active:scale-95"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                      className="size-5"
                    >
                      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>
          <div className="h-0.5 bg-gradient-to-r from-blaugrana-500 via-garnet-500 to-gold-500" />
        </header>
        <main
          className={
            user
              ? "mx-auto max-w-5xl px-4 pt-6 pb-28 md:pb-10"
              : "mx-auto max-w-5xl px-4 pt-6 pb-10"
          }
        >
          {children}
        </main>
        {user && <BottomNav items={nav} />}
        <ServiceWorker />
        <footer
          className={
            user
              ? "mx-auto max-w-5xl px-4 pb-24 text-center text-xs text-ink-muted md:pb-8"
              : "mx-auto max-w-5xl px-4 pb-8 text-center text-xs text-ink-muted"
          }
        >
          <Link href="/rules" className="underline">
            How points work
          </Link>{" "}
          ·{" "}
          <Link href="/credits" className="underline">
            Credits
          </Link>{" "}
          · Culé XI is a free, private game for friends. Not affiliated with FC Barcelona.
        </footer>
      </body>
    </html>
  );
}
