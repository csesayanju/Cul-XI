import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { Wordmark } from "@/components/wordmark";
import { getSessionUser } from "@/lib/auth";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Culé XI", template: "%s · Culé XI" },
  description: "Private fantasy football for Barça matches. Free to play, just for friends.",
  robots: { index: false, follow: false },
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
  const nav = [
    { href: "/matches", label: "Matches" },
    { href: "/leaderboard", label: "Table" },
    { href: "/rules", label: "Rules" },
    { href: "/trivia", label: "Trivia" },
    ...(user?.profile?.is_admin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <header className="sticky top-0 z-10 bg-brand text-brand-ink shadow-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
            <Link href="/" aria-label="Culé XI home">
              <Wordmark className="text-xl" />
            </Link>
            {user && (
              <nav className="flex items-center gap-3 overflow-x-auto text-sm font-medium">
                {nav.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    // Fully prefetch the main tabs (cached for 60s via staleTimes) so taps are instant.
                    prefetch={item.href !== "/admin"}
                    className="opacity-90 hover:opacity-100"
                  >
                    {item.label}
                  </Link>
                ))}
                <form action={signOut}>
                  <button className="opacity-70 hover:opacity-100" type="submit">
                    Sign out
                  </button>
                </form>
              </nav>
            )}
          </div>
          <div className="h-1 bg-gradient-to-r from-blaugrana-500 via-garnet-500 to-gold-500" />
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-2xl px-4 pb-8 text-center text-xs text-ink-muted">
          <Link href="/rules" className="underline">
            How points work
          </Link>{" "}
          ·{" "}
          <Link href="/credits" className="underline">
            Photo credits
          </Link>{" "}
          · Culé XI is a free, private game for friends. Not affiliated with FC Barcelona.
        </footer>
      </body>
    </html>
  );
}
