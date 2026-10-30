"use client";

import { useEffect, useState, useTransition } from "react";

import { tttGuess } from "@/app/actions/tiki-taka-toe";
import { Flag } from "@/components/flag";
import { cx, Notice } from "@/components/ui";
import type { Category } from "@/features/tiki-taka-toe/grid";
import { GUESSES } from "@/features/tiki-taka-toe/grid";
import type { TttView } from "@/features/tiki-taka-toe/server";
import { PlayerSearch } from "@/features/trivia/components/player-search";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** Club badge colours: a stable pick per club (original monograms, never crests). */
const BADGES = [
  "from-garnet-500 to-garnet-700",
  "from-blaugrana-500 to-blaugrana-700",
  "from-emerald-500 to-emerald-700",
  "from-sky-500 to-sky-700",
  "from-amber-500 to-orange-600",
  "from-violet-500 to-violet-700",
  "from-rose-500 to-rose-700",
  "from-teal-500 to-teal-700",
];
const badgeOf = (label: string) => {
  if (label === "Barcelona") return "from-blaugrana-500 via-blaugrana-700 to-garnet-500";
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BADGES[h % BADGES.length]!;
};
const monogram = (label: string) => {
  const words = label.split(/\s+/).filter((w) => !/^(FC|CF|CD|UD|SD|RC|RCD|de|AC|AS|SS)$/i.test(w));
  const first = words[0] ?? label;
  return (words.length > 1 ? words.map((w) => w[0]).join("") : first.slice(0, 3)).toUpperCase();
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

const AWARD_ICONS = {
  // Boot (Pichichi), glove (Zamora), ball (100 goals).
  pichichi: "M4 15h7l2-6 3 1-1 5h4a2 2 0 0 1 2 2v1H4v-3Z",
  zamora:
    "M8 21v-6L5 11V6a1 1 0 0 1 2 0v4M10 10V4a1 1 0 0 1 2 0v6m0-1V3a1 1 0 0 1 2 0v7m0-1V5a1 1 0 0 1 2 0v8l1-2a1 1 0 0 1 2 1l-3 6v3",
  liga100: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4 3 2-1 4h-4l-1-4 3-2Z",
  // Ball on a plinth (Ballon d'Or).
  ballondor: "M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM9 15l-1 4h8l-1-4M6 21h12",
} as const;

/** A row/column header: flag, club monogram, decade, position or trophy. */
function CategoryLabel({ c, compact, badge }: { c: Category; compact?: boolean; badge?: string }) {
  const icon =
    c.type === "nation" ? (
      <Flag code={c.key} className="h-5 w-7" />
    ) : c.type === "club" && badge ? (
      <span className="flex size-9 items-center justify-center rounded-full bg-white p-1 shadow-md ring-1 ring-black/10">
        {/* eslint-disable-next-line @next/next/no-img-element -- small Commons thumbnails */}
        <img
          src={badge}
          alt=""
          width={28}
          height={28}
          loading="lazy"
          className="size-7 object-contain"
        />
      </span>
    ) : c.type === "club" ? (
      <span
        className={cx(
          "flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-black tracking-tight text-white shadow-md ring-2 ring-white/10",
          badgeOf(c.label),
        )}
      >
        {monogram(c.label)}
      </span>
    ) : c.type === "decade" ? (
      <span className="tabular text-base leading-none font-black text-gold-500">
        {c.key.slice(2)}s
      </span>
    ) : c.type === "award" ? (
      <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-300 to-gold-500 text-blaugrana-950 shadow-md">
        <Icon path={AWARD_ICONS[c.key]} />
      </span>
    ) : (
      <span className="rounded-md bg-blaugrana-500 px-1.5 py-0.5 text-[10px] font-black text-white">
        {c.key}
      </span>
    );
  const text = c.type === "decade" ? `${c.key}s` : c.label;
  return (
    <span
      className={cx(
        "flex flex-col items-center justify-center gap-1 text-center",
        compact && "flex-row gap-2",
      )}
    >
      {icon}
      <span className="text-[11px] leading-tight font-bold text-balance">{text}</span>
    </span>
  );
}

const describe = (c: Category) =>
  c.type === "club"
    ? `played for ${c.label}`
    : c.type === "nation"
      ? `from ${c.label}`
      : c.type === "decade"
        ? `at Barça in the ${c.key}s`
        : c.type === "award"
          ? c.key === "liga100"
            ? "scored 100+ La Liga goals"
            : c.label.replace(/^Won/, "won")
          : `a ${c.label.toLowerCase()}`;

/** The daily Tiki-Taka-Toe grid: tap a square, name a player who fits its row and column. */
export function TikiTakaToe({ initial }: { initial: TttView }) {
  const [game, setGame] = useState(initial);
  const [open, setOpen] = useState<number | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [justFilled, setJustFilled] = useState<number | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function guess(cell: number, playerId: number) {
    start(async () => {
      const res = await tttGuess(cell, playerId);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      const filledNow = res.game.cells[cell]?.player && !game.cells[cell]?.player;
      setJustFilled(filledNow ? cell : null);
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
      if (res.tone !== "info" || res.game.finished) setOpen(null);
    });
  }

  const row = open != null ? game.rows[Math.floor(open / 3)]! : null;
  const col = open != null ? game.cols[open % 3]! : null;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-gold-500/20 blur-3xl"
        />
        <p className="relative text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Tiki-Taka-Toe · {dayLabel(game.day)}
        </p>
        <div className="relative mt-3 flex items-end justify-between gap-4">
          <div>
            <p className="tabular text-4xl leading-none font-black">
              {game.filled}
              <span className="text-xl text-white/60">/9</span>
            </p>
            <p className="mt-1 text-xs font-semibold text-white/70">squares filled</p>
          </div>
          <div className="text-right">
            <div className="flex justify-end gap-1" aria-label={`${game.guessesLeft} guesses left`}>
              {Array.from({ length: GUESSES }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    "size-2.5 rounded-full transition-colors duration-300",
                    i < game.guessesLeft ? "bg-gold-400" : "bg-white/20",
                  )}
                />
              ))}
            </div>
            <p className="mt-1.5 text-xs font-semibold text-white/70">
              {game.guessesLeft} {game.guessesLeft === 1 ? "guess" : "guesses"} left
              {game.rarity != null && (
                <>
                  {" "}
                  · rarity <span className="tabular font-black text-white">{game.rarity}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </section>

      {message && (
        <div key={message.key} aria-live="polite">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="mx-auto grid max-w-xl grid-cols-[minmax(0,0.8fr)_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2">
        <div aria-hidden />
        {game.cols.map((c, i) => (
          <div key={`c${i}`} className="flex min-h-16 items-end justify-center pb-1">
            <CategoryLabel c={c} badge={game.badges?.[c.key]} />
          </div>
        ))}
        {game.rows.map((r, ri) => (
          <div key={`r${ri}`} className="contents">
            <div className="flex items-center justify-center pr-1">
              <CategoryLabel c={r} badge={game.badges?.[r.key]} />
            </div>
            {game.cols.map((_, ci) => {
              const i = ri * 3 + ci;
              const cell = game.cells[i]!;
              const filled = !!cell.player;
              const playable = !game.finished && !filled;
              return (
                <button
                  key={i}
                  type="button"
                  disabled={!playable || pending}
                  onClick={() => setOpen(i)}
                  aria-label={
                    filled
                      ? `${cell.player!.name}`
                      : `Square: ${describe(r)} and ${describe(game.cols[ci]!)}`
                  }
                  className={cx(
                    "relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-2xl border p-1.5 text-center transition duration-150",
                    filled
                      ? "border-gold-400/70 bg-gold-400/15"
                      : game.finished
                        ? "border-line bg-surface-raised/50"
                        : "border-line bg-surface-raised hover:border-accent/60 active:scale-95",
                    justFilled === i && "animate-pop",
                  )}
                >
                  {filled ? (
                    <>
                      <Flag code={cell.player!.countryCode} className="mb-1" />
                      <span className="line-clamp-2 text-[11px] leading-tight font-bold sm:text-xs">
                        {cell.player!.name}
                      </span>
                      {cell.percent != null && (
                        <span className="tabular mt-0.5 text-[10px] font-semibold text-ink-muted">
                          {cell.percent}%
                        </span>
                      )}
                    </>
                  ) : game.finished ? (
                    <>
                      <span className="tabular text-sm font-black text-ink-muted">
                        {cell.answers}
                      </span>
                      <span className="text-[10px] text-ink-muted">answers</span>
                      {cell.examples[0] && (
                        <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-ink-muted">
                          e.g. {cell.examples[0]}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-2xl font-light text-ink-muted">+</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {game.finished && (
        <section className="animate-rise rounded-3xl border border-line bg-surface-raised p-5 text-center">
          <p className="tabular text-5xl font-black">
            {game.filled}
            <span className="text-2xl text-ink-muted">/9</span>
          </p>
          <p className="mt-1 font-bold">
            {game.filled === 9
              ? "Immaculate! 🏆"
              : game.filled >= 6
                ? "Tiki-taka mastery."
                : "Tough grid today."}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Rarity score <span className="tabular font-bold text-ink">{game.rarity}</span> (lower is
            rarer) · {game.players} {game.players === 1 ? "player" : "players"} today. A new grid
            arrives at midnight (India time).
          </p>
        </section>
      )}

      {open != null && row && col && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-blaugrana-950/60 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Name a player"
            className="w-full max-w-md animate-rise rounded-t-3xl border border-line bg-surface-raised p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line sm:hidden" />
            <p className="mb-3 text-sm text-ink-muted">A player who…</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[row, col].map((c, i) => (
                <div key={i} className="rounded-2xl border border-line bg-surface p-3">
                  <CategoryLabel c={c} badge={game.badges?.[c.key]} />
                  <p className="mt-1 text-center text-[11px] text-ink-muted">{describe(c)}</p>
                </div>
              ))}
            </div>
            <PlayerSearch onPick={(p) => guess(open, p.id)} disabled={pending} autoFocus inline />
            <p className="mt-2 text-xs text-ink-muted">
              {pending
                ? "Checking…"
                : `Each guess uses one of your ${game.guessesLeft} remaining, right or wrong.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
