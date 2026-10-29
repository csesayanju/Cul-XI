import Link from "next/link";

import { cx } from "@/components/ui";

const TABS = [
  { href: "/trivia", label: "Culé Ten" },
  { href: "/trivia/grid", label: "Tiki-Taka-Toe" },
] as const;

/** Switches between the daily trivia games. */
export function TriviaTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav
      aria-label="Trivia games"
      className="mb-5 flex gap-1 rounded-2xl border border-line bg-surface-raised p-1"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cx(
            "flex-1 rounded-xl px-3 py-2 text-center text-sm font-bold transition active:scale-[0.98]",
            t.href === active
              ? "bg-brand text-brand-ink shadow-md shadow-brand/25"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
