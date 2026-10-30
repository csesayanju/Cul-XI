"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { cx } from "@/components/ui";

const TABS = [
  { href: "/trivia", label: "Culé Ten", icon: "🔟" },
  { href: "/trivia/grid", label: "Grid", icon: "#️⃣" },
  { href: "/trivia/connections", label: "Connect", icon: "🧩" },
  { href: "/trivia/missing-xi", label: "Missing XI", icon: "🏟️" },
  { href: "/trivia/career", label: "Career", icon: "🧭" },
  { href: "/trivia/odd-one-out", label: "Odd One", icon: "🕵️" },
  { href: "/trivia/higher-lower", label: "Hi-Lo", icon: "📈" },
] as const;

export type TriviaHref = (typeof TABS)[number]["href"];

/**
 * Switches between the trivia games: a swipeable strip on phones (the current game scrolled
 * into view), all in one row on wider screens.
 */
export function TriviaTabs({ active }: { active: TriviaHref }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, []);
  return (
    <nav
      aria-label="Trivia games"
      className="-mx-4 mb-5 [scrollbar-width:none] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max min-w-full snap-x gap-1 rounded-2xl border border-line bg-surface-raised p-1">
        {TABS.map((t) => (
          <Link
            key={t.href}
            ref={t.href === active ? activeRef : undefined}
            href={t.href}
            aria-current={t.href === active ? "page" : undefined}
            className={cx(
              "flex min-w-[4.75rem] flex-1 snap-center flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-center text-xs font-bold whitespace-nowrap transition active:scale-[0.97]",
              t.href === active
                ? "bg-brand text-brand-ink shadow-md shadow-brand/25"
                : "text-ink-muted hover:text-ink",
            )}
          >
            <span aria-hidden className="text-base leading-none">
              {t.icon}
            </span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
