"use client";

import { useState, useTransition } from "react";

import { triviaGuess } from "@/app/actions/trivia";
import { Card, cx, Notice } from "@/components/ui";
import { PlayerSearch } from "@/features/trivia/components/player-search";
import { LIVES } from "@/features/trivia/game";
import type { GameView } from "@/features/trivia/server";

/** The daily Culé Ten board: 10 ranked slots with nationality hints, lives and a guess box. */
export function CuleTen({ initial }: { initial: GameView }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function guess(playerId: number) {
    startTransition(async () => {
      const res = await triviaGuess(playerId);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error" });
        return;
      }
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone });
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Culé Ten · {game.day}
        </p>
        <h2 className="text-xl font-black">{game.title}</h2>
        {game.subtitle && <p className="text-sm text-ink-muted">{game.subtitle}</p>}
        <div className="flex items-center justify-between pt-2 text-sm">
          <span className="font-semibold">{game.found}/10 found</span>
          <span aria-label={`${game.livesLeft} lives left`} className="text-lg tracking-widest">
            {Array.from({ length: LIVES }, (_, i) => (i < game.livesLeft ? "❤️" : "🖤")).join("")}
          </span>
        </div>
      </Card>

      {!game.finished && (
        <div className="space-y-2">
          <PlayerSearch onPick={(p) => guess(p.id)} disabled={pending} autoFocus />
          {pending && <p className="text-xs text-ink-muted">Checking…</p>}
        </div>
      )}
      {message && (
        <Notice tone={message.tone === "info" ? "info" : message.tone}>{message.text}</Notice>
      )}

      <ol className="space-y-2">
        {game.slots.map((s) => (
          <li
            key={s.rank}
            className={cx(
              "flex items-center gap-3 rounded-xl border p-3",
              s.answer?.found
                ? "border-gold-400 bg-gold-300/20"
                : s.answer
                  ? "border-garnet-300 bg-garnet-100/10"
                  : "border-line bg-surface-raised",
            )}
          >
            <span className="w-6 text-center text-lg font-black text-ink-muted">{s.rank}</span>
            <span aria-hidden className="text-2xl leading-none">
              {s.hint.flag ?? "🏳️"}
            </span>
            <span className="min-w-0 flex-1">
              {s.answer ? (
                <>
                  <span
                    className={cx("block truncate font-bold", !s.answer.found && "text-ink-muted")}
                  >
                    {s.answer.name}
                  </span>
                  {s.answer.statLabel && (
                    <span className="text-xs text-ink-muted">{s.answer.statLabel}</span>
                  )}
                </>
              ) : (
                <span className="text-sm text-ink-muted">
                  {[s.hint.nationality ?? "Unknown", s.hint.era].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            {s.answer && !s.answer.found && <span className="text-xs text-garnet-500">missed</span>}
          </li>
        ))}
      </ol>

      {game.wrongGuesses.length > 0 && (
        <p className="text-xs text-ink-muted">Wrong guesses: {game.wrongGuesses.join(", ")}</p>
      )}
      {game.finished && (
        <Notice tone={game.found >= 7 ? "success" : "info"}>
          {game.found === 10
            ? "Perfect 10! 🏆"
            : `You found ${game.found}/10. A new list arrives at midnight (India time).`}
        </Notice>
      )}
    </div>
  );
}
