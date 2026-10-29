"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";

import { triviaSearch } from "@/app/actions/trivia";
import { Flag } from "@/components/flag";
import { Input } from "@/components/ui";

import type { SearchResult } from "../server";

/** Autocomplete over the Barça player repository (debounced server search). */
export function PlayerSearch({
  onPick,
  disabled,
  placeholder = "Type a player's name…",
  autoFocus,
  inline,
}: {
  onPick: (player: SearchResult) => void;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /** Show results in the flow (e.g. in a bottom sheet) instead of a dropdown. */
  inline?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [, startTransition] = useTransition();
  const listId = useId();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const found = await triviaSearch(q);
        if (latest.current === q) {
          setResults(found);
          setActive(0);
        }
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const visible = query.trim().length >= 2 ? results : [];

  function pick(p: SearchResult) {
    onPick(p);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, visible.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && visible[active]) {
            e.preventDefault();
            pick(visible[active]!);
          } else if (e.key === "Escape") {
            setResults([]);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={visible.length > 0}
        aria-controls={listId}
        aria-label="Search players"
      />
      {visible.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className={
            inline
              ? "mt-2 max-h-[40dvh] animate-rise overflow-y-auto rounded-2xl border border-line bg-surface py-1"
              : "absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 animate-rise overflow-y-auto rounded-2xl border border-line bg-surface-raised py-1 shadow-2xl shadow-blaugrana-950/25"
          }
        >
          {visible.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
                className={`flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-line/60" : ""
                }`}
              >
                <Flag code={p.countryCode} />
                <span className="flex-1 font-medium">{p.name}</span>
                {p.years && <span className="text-xs text-ink-muted">{p.years}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
