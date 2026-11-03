import Link from "next/link";

import { cx } from "@/components/ui";

const TABS = [
  { href: "/matches", label: "⚽ Matches" },
  { href: "/matches/rules", label: "📖 Rules" },
] as const;

/** Switches between the Fantasy matches and the Fantasy rules. */
export function FantasyTabs({ active }: { active: (typeof TABS)[number]["href"] }) {
  return (
    <nav
      aria-label="Fantasy"
      className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-raised p-1"
    >
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? "page" : undefined}
          className={cx(
            "rounded-full py-2 text-center text-sm font-extrabold transition active:scale-[0.97]",
            t.href === active
              ? "bg-gradient-to-br from-blaugrana-500 to-garnet-500 text-white shadow-md"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
