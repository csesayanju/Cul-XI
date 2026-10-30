"use client";

import { useState, useTransition } from "react";

import { xiGuess } from "@/app/actions/games";
import { Flag } from "@/components/flag";
import { cx, Notice } from "@/components/ui";
import type { XiView } from "@/features/missing-xi/server";
import { PlayerSearch } from "@/features/trivia/components/player-search";

const surname = (name: string) => {
  const parts = name.split(" ");
  return parts.length > 1 && name.length > 12 ? parts.slice(1).join(" ") : name;
};

/** Missing XI: a famous final's starting line-up on a pitch; name all eleven. */
export function MissingXi({ initial }: { initial: XiView }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [lastFound, setLastFound] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function guess(playerId: number) {
    start(async () => {
      const res = await xiGuess(playerId);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      const before = new Set(game.slots.flatMap((s, i) => (s.answer?.found ? [i] : [])));
      setLastFound(res.game.slots.findIndex((s, i) => s.answer?.found && !before.has(i)));
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <p className="text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          {game.competition} final · {game.year}
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-black">{game.team}&apos;s starting XI</h2>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-white/70">
          <span className="tabular">
            <span className="text-lg font-black text-white">{game.found}</span>/{game.slots.length}{" "}
            found
          </span>
          <span className="flex gap-1" aria-label={`${game.livesLeft} lives left`}>
            {Array.from({ length: game.lives }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "size-2.5 rounded-full",
                  i < game.livesLeft ? "bg-gold-400" : "bg-white/20",
                )}
              />
            ))}
          </span>
        </div>
      </section>

      {/* The pitch: original drawing, no club marks. */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border border-emerald-900/40 bg-[repeating-linear-gradient(0deg,#15803d_0,#15803d_10%,#16a34a_10%,#16a34a_20%)] shadow-inner sm:aspect-[4/3]">
        <div aria-hidden className="absolute inset-3 rounded-lg border-2 border-white/40" />
        <div aria-hidden className="absolute inset-x-3 top-1/2 h-0.5 bg-white/40" />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 size-20 -translate-1/2 rounded-full border-2 border-white/40"
        />
        <div
          aria-hidden
          className="absolute bottom-3 left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-b-0 border-white/40"
        />
        <div
          aria-hidden
          className="absolute top-3 left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-t-0 border-white/40"
        />

        {game.slots.map((s, i) => (
          <div
            key={i}
            className="absolute flex w-20 -translate-1/2 flex-col items-center gap-0.5 text-center"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <span
              className={cx(
                "tabular relative flex size-10 items-center justify-center rounded-full border-2 text-sm font-black shadow-lg",
                s.answer?.found
                  ? "border-gold-300 bg-gold-400 text-blaugrana-950"
                  : s.answer
                    ? "border-white/60 bg-white/80 text-ink-muted"
                    : "border-white/70 bg-blaugrana-700 text-white",
                lastFound === i && "animate-pop",
              )}
            >
              {s.number ?? "?"}
              {s.captain && (
                <span className="absolute -top-1 -right-1 rounded-full bg-gold-400 px-1 text-[9px] font-black text-blaugrana-950">
                  C
                </span>
              )}
            </span>
            <span className="max-w-full truncate rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {s.answer ? surname(s.answer.name) : s.pos}
            </span>
            {!s.answer && <Flag code={s.countryCode} className="h-2.5 w-4" />}
          </div>
        ))}
      </div>

      {!game.finished && (
        <div>
          <PlayerSearch
            onPick={(p) => guess(p.id)}
            disabled={pending}
            placeholder="Name a player in this XI…"
          />
          {pending && (
            <p className="mt-1.5 animate-pulse text-xs font-medium text-ink-muted">Checking…</p>
          )}
        </div>
      )}
      {message && (
        <div key={message.key} aria-live="polite">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      {game.wrong.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-ink-muted">Not in it</span>
          {game.wrong.map((n, i) => (
            <span
              key={`${n}-${i}`}
              className="rounded-full border border-garnet-300/50 px-2 py-0.5 text-ink-muted line-through"
            >
              {n}
            </span>
          ))}
        </div>
      )}
      {game.finished && (
        <section className="animate-rise rounded-3xl border border-line bg-surface-raised p-5 text-center">
          <p className="tabular text-5xl font-black">
            {game.found}
            <span className="text-2xl text-ink-muted">/{game.slots.length}</span>
          </p>
          <p className="mt-1 font-bold">
            {game.found === game.slots.length
              ? "Perfect XI! 🏆"
              : game.found >= 8
                ? "Great memory."
                : "Tough one."}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            A new line-up arrives at midnight (India time).
          </p>
        </section>
      )}
    </div>
  );
}
