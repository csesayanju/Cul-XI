import type { Metadata, Viewport } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/wordmark";

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

const nav = [
  { href: "/matches", label: "Matches" },
  { href: "/leaderboard", label: "Table" },
  { href: "/trivia", label: "Trivia" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh font-sans antialiased">
        <header className="sticky top-0 z-10 bg-brand text-brand-ink shadow-sm">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" aria-label="Culé XI home">
              <Wordmark className="text-xl" />
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="opacity-90 hover:opacity-100">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="h-1 bg-gradient-to-r from-blaugrana-500 via-garnet-500 to-gold-500" />
        </header>
        <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
