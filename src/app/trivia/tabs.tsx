import Link from "next/link";

import { cx } from "@/components/ui";

const TABS = [
  { href: "/trivia", label: "Culé Ten", icon: "🔟" },
  { href: "/trivia/grid", label: "Grid", icon: "#️⃣" },
  { href: "/trivia/career", label: "Career", icon: "🧭" },
  { href: "/trivia/higher-lower", label: "Hi-Lo", icon: "📈" },
] as const;

/** Switches between the trivia games. */
export function TriviaTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav
      aria-label="Trivia games"
      className="mb-5 grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface-raised p-1"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cx(
            "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-center text-xs font-bold transition active:scale-[0.97]",
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
    </nav>
  );
}
