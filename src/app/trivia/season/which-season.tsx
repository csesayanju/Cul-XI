"use client";

import { useState, useTransition } from "react";

import { seasonGuess } from "@/app/actions/games";
import { Confetti } from "@/components/confetti";
import { cx, Notice } from "@/components/ui";
import { GiveUp } from "@/app/trivia/give-up";
import { SEASON_GUESSES, seasonLabel } from "@/features/which-season/season";
import type { SeasonView } from "@/features/which-season/server";

const decadeOf = (y: number) => Math.floor(y / 10) * 10;

/** The daily Which Season?: clue cards, a decade → season picker, earlier/later feedback. */
export function WhichSeason({
  initial,
  archiveDay,
}: {
  initial: SeasonView;
  /** Set when playing a past day from the archive (practice). */
  archiveDay?: string;
}) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [pending, start] = useTransition();
  const decades = [...new Set(game.choices.map(decadeOf))];
  const [decade, setDecade] = useState(() => {
    const last = game.guesses.at(-1)?.startYear;
    return last != null ? decadeOf(last) : (decades.at(-1) ?? 2000);
  });

  // What the guesses so far rule out: everything outside the tightest earlier/later window.
  const lowest = Math.max(
    -Infinity,
    ...game.guesses.filter((g) => g.result === "later").map((g) => g.startYear + 1),
  );
  const highest = Math.min(
    Infinity,
    ...game.guesses.filter((g) => g.result === "earlier").map((g) => g.startYear - 1),
  );
  const guessed = new Set(game.guesses.map((g) => g.startYear));

  function guess(startYear: number) {
    start(async () => {
      const res = await seasonGuess(startYear, archiveDay);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
    });
  }

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-gold-500/20 blur-3xl"
        />
        <p className="relative text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Which Season?
        </p>
        <h2 className="tabular relative mt-1 font-display text-4xl leading-none font-black">
          {game.answer ? game.answer.season : "????–??"}
        </h2>
        <div className="relative mt-3 flex items-center justify-between text-xs font-semibold text-white/70">
          <span>
            {game.clues.length}/{game.totalClues} clues
          </span>
          <span className="flex gap-1" aria-label={`${game.guessesLeft} guesses left`}>
            {Array.from({ length: SEASON_GUESSES }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "size-2.5 rounded-full transition-colors duration-300",
                  i < game.guessesLeft ? "bg-gold-400" : "bg-white/20",
                )}
              />
            ))}
          </span>
        </div>
      </section>

      <ol className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: game.totalClues }, (_, i) => {
          const clue = game.clues[i];
          return (
            <li
              key={i}
              className={cx(
                "rounded-2xl border p-3",
                clue
                  ? "animate-rise border-gold-400/40 bg-gold-400/10"
                  : "border-dashed border-line text-ink-muted",
              )}
            >
              <p className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                {clue ? clue.label : `Clue ${i + 1}`}
              </p>
              <p className="mt-0.5 font-bold">{clue ? clue.value : "🔒 Unlocks after a miss"}</p>
            </li>
          );
        })}
      </ol>

      {message && (
        <div key={message.key} aria-live="polite">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {game.guesses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-ink-muted">Your guesses</span>
          {game.guesses.map((g) => (
            <span
              key={g.startYear}
              className={cx(
                "tabular flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold",
                g.result === "right"
                  ? "border-gold-400 bg-gold-400/15"
                  : g.close
                    ? "border-gold-400/60 text-ink"
                    : "border-garnet-300/50 text-ink-muted",
              )}
            >
              {g.season}
              {g.result === "earlier" ? " ⬇️" : g.result === "later" ? " ⬆️" : " ✅"}
            </span>
          ))}
        </div>
      )}

      {!game.finished && (
        <section className="space-y-2" aria-label="Pick a season">
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {decades.map((d) => {
              const out = d + 9 < lowest || d > highest;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecade(d)}
                  aria-pressed={d === decade}
                  className={cx(
                    "tabular shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold transition active:scale-95",
                    d === decade
                      ? "border-transparent bg-brand text-brand-ink"
                      : out
                        ? "border-line text-ink-muted/50"
                        : "border-line text-ink-muted hover:text-ink",
                  )}
                >
                  {d}s
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {game.choices
              .filter((y) => decadeOf(y) === decade)
              .map((y) => {
                const ruled = y < lowest || y > highest;
                const tried = guessed.has(y);
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={pending || tried}
                    onClick={() => guess(y)}
                    className={cx(
                      "tabular min-h-11 rounded-xl border text-sm font-bold transition active:scale-95 disabled:cursor-not-allowed",
                      tried
                        ? "border-line bg-line/40 text-ink-muted line-through"
                        : ruled
                          ? "border-line text-ink-muted/60"
                          : "border-line bg-surface-raised hover:border-accent/60",
                    )}
                  >
                    {seasonLabel(y)}
                  </button>
                );
              })}
          </div>
          <p className="text-xs text-ink-muted">
            {pending
              ? "Checking…"
              : "⬆️ = the answer is later, ⬇️ = earlier. Faded seasons are already ruled out."}
          </p>
        </section>
      )}

      {game.finished && game.answer && (
        <section className="relative animate-rise overflow-hidden rounded-3xl border border-line bg-surface-raised p-5">
          {game.solved && <Confetti />}
          <div className="text-center">
            <p className="text-4xl">{game.solved ? "🎯" : "🫣"}</p>
            <p className="mt-1 font-bold">
              {game.solved
                ? `Solved in ${game.guesses.length} ${game.guesses.length === 1 ? "guess" : "guesses"}!`
                : `It was ${game.answer.season}.`}
            </p>
          </div>
          {game.answer.clasicos.length > 0 && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                Clásicos that season
              </p>
              <ul className="divide-y divide-line text-sm">
                {game.answer.clasicos.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{c.home}</span>{" "}
                      <span className="tabular font-black">{c.score}</span>{" "}
                      <span className="font-semibold">{c.away}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {c.competition === "La Liga" ? "Liga" : c.competition}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-center text-sm text-ink-muted">
            A new season arrives at midnight (India time).
          </p>
        </section>
      )}
      {!game.finished && <GiveUp game="season" archiveDay={archiveDay} />}
    </div>
  );
}
