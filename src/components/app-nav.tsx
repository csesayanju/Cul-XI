"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "./ui";

/** Main navigation: a pill bar in the header on desktop, a bottom tab bar on phones. */

export type NavIcon = "matches" | "table" | "trivia" | "rules" | "admin";
export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

const ICONS: Record<NavIcon, ReactNode> = {
  matches: (
    // A football (Fantasy).
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 4 3-1.5 4.5h-5L8 10l4-3ZM12 7V3.5M16 10l3.5-1.5M14.5 14.5l2 3M9.5 14.5l-2 3M8 10 4.5 8.5" />
    </>
  ),
  table: (
    <>
      <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" />
    </>
  ),
  trivia: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5h.01" />
    </>
  ),
  rules: (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7h6M9 11h4" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

export function Icon({ name, className }: { name: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cx("size-6", className)}
    >
      {ICONS[name]}
    </svg>
  );
}

function useActive() {
  const path = usePathname();
  return (href: string) => path === href || path.startsWith(`${href}/`);
}

export function TopNav({ items }: { items: NavItem[] }) {
  const isActive = useActive();
  return (
    <nav className="hidden items-center gap-1 text-sm font-semibold md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          // Fully prefetch the main tabs (cached for 60s via staleTimes) so taps are instant.
          prefetch={item.href !== "/admin"}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={cx(
            "rounded-full px-3 py-1.5 transition-colors",
            isActive(item.href) ? "bg-white/15 text-white" : "text-white/75 hover:text-white",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Hidden while picking a team: that screen has its own sticky save bar. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const isActive = useActive();
  const path = usePathname();
  if (/^\/matches\/[^/]+\/pick/.test(path)) return null;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface-raised/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                prefetch={item.href !== "/admin"}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:scale-95",
                  active ? "text-accent" : "text-ink-muted",
                )}
              >
                <span
                  className={cx(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-accent/12",
                  )}
                >
                  <Icon name={item.icon} className="size-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
