"use client";

import { useState, useTransition } from "react";

import { triviaGuess } from "@/app/actions/trivia";
import { Flag } from "@/components/flag";
import { cx, Notice } from "@/components/ui";
import { PlayerSearch } from "@/features/trivia/components/player-search";
import { LIST_SIZE, LIVES } from "@/features/trivia/game";
import type { GameView } from "@/features/trivia/server";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

function Heart({ full }: { full: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cx(
        "size-5 transition duration-300",
        full ? "fill-garnet-300 text-garnet-300" : "fill-none text-white/35",
      )}
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.6 4 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.7 1.1-1.6 2.7-2.7 4.7-2.7 3.3 0 5.7 3.1 4.5 6.6-1.7 4.8-9.2 9.4-9.2 9.4Z" />
    </svg>
  );
}

/** The daily Culé Ten board: 10 ranked slots with nationality hints, lives and a guess box. */
export function CuleTen({ initial }: { initial: GameView }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [lastFound, setLastFound] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function guess(playerId: number) {
    startTransition(async () => {
      const res = await triviaGuess(playerId);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      const before = new Set(game.slots.filter((s) => s.answer?.found).map((s) => s.rank));
      setLastFound(
        res.game.slots.find((s) => s.answer?.found && !before.has(s.rank))?.rank ?? null,
      );
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
    });
  }

  const progress = (game.found / LIST_SIZE) * 100;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-garnet-500/30 blur-3xl"
        />
        <p className="relative text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Culé Ten · {dayLabel(game.day)}
        </p>
        <h2 className="relative mt-1 text-2xl leading-tight font-black text-balance">
          {game.title}
        </h2>
        {game.subtitle && (
          <p className="relative mt-1 text-sm text-pretty text-white/70">{game.subtitle}</p>
        )}
        <div className="relative mt-4 flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-white/15"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={LIST_SIZE}
            aria-valuenow={game.found}
            aria-label="Players found"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-300 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="tabular text-sm font-black">
            {game.found}
            <span className="font-semibold text-white/60">/{LIST_SIZE}</span>
          </span>
          <span
            key={game.livesLeft}
            aria-label={`${game.livesLeft} lives left`}
            className={cx(
              "flex gap-0.5",
              game.livesLeft < LIVES && !game.finished && "animate-shake",
            )}
          >
            {Array.from({ length: LIVES }, (_, i) => (
              <Heart key={i} full={i < game.livesLeft} />
            ))}
          </span>
        </div>
      </section>

      {!game.finished && (
        <div>
          <PlayerSearch onPick={(p) => guess(p.id)} disabled={pending} autoFocus />
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

      <ol className="space-y-2">
        {game.slots.map((s) => {
          const found = !!s.answer?.found;
          const missed = !!s.answer && !found;
          return (
            <li
              key={s.rank}
              className={cx(
                "flex min-h-16 items-center gap-3 rounded-2xl border p-3 transition-colors duration-300",
                found && "border-gold-400/70 bg-gold-400/10",
                found && lastFound === s.rank && "animate-pop",
                missed && "border-line bg-surface-raised/60",
                !s.answer && "border-line bg-surface-raised",
              )}
            >
              <span
                className={cx(
                  "tabular flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-black",
                  found
                    ? "bg-gold-400 text-blaugrana-950"
                    : missed
                      ? "bg-line/60 text-ink-muted"
                      : "bg-brand text-brand-ink",
                )}
              >
                {s.rank}
              </span>
              <Flag code={s.hint.code} />
              <span className="min-w-0 flex-1">
                {s.answer ? (
                  <>
                    <span className={cx("block truncate font-bold", missed && "text-ink-muted")}>
                      {s.answer.name}
                    </span>
                    <span className="block truncate text-xs text-ink-muted">
                      {[s.answer.statLabel, s.hint.era].filter(Boolean).join(" · ")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block h-3 w-28 rounded-full bg-line/70" aria-hidden />
                    <span className="mt-1.5 block truncate text-xs font-medium text-ink-muted">
                      {[s.hint.nationality ?? "Unknown", s.hint.era].filter(Boolean).join(" · ")}
                    </span>
                  </>
                )}
              </span>
              {found && (
                <svg
                  viewBox="0 0 24 24"
                  aria-label="Found"
                  className="size-5 shrink-0 text-gold-500"
                >
                  <path
                    d="m5 12.5 4.5 4.5L19 7.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {missed && (
                <span className="shrink-0 rounded-full bg-garnet-500/10 px-2 py-0.5 text-[11px] font-bold text-garnet-500">
                  missed
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {game.wrongGuesses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-ink-muted">Wrong guesses</span>
          {game.wrongGuesses.map((name, i) => (
            <span
              key={`${name}-${i}`}
              className="rounded-full border border-garnet-300/50 px-2 py-0.5 text-ink-muted line-through"
            >
              {name}
            </span>
          ))}
        </div>
      )}
      {game.finished && (
        <section className="animate-rise rounded-3xl border border-line bg-surface-raised p-5 text-center">
          <p className="tabular text-5xl font-black">
            {game.found}
            <span className="text-2xl text-ink-muted">/{LIST_SIZE}</span>
          </p>
          <p className="mt-1 font-bold">
            {game.found === LIST_SIZE
              ? "Perfect 10! 🏆"
              : game.found >= 7
                ? "Proper culé knowledge."
                : "Tough one today."}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            A new list arrives at midnight (India time).
          </p>
        </section>
      )}
    </div>
  );
}
