"use client";

import { useState, useTransition } from "react";

import { oooAnswer } from "@/app/actions/games";
import { Button, cx, Notice } from "@/components/ui";
import type { OooView } from "@/features/odd-one-out/server";

/** Endless Odd One Out: four players, one doesn't belong; the server judges every pick. */
export function OddOneOut({ initial }: { initial: OooView }) {
  const [game, setGame] = useState(initial);
  const [result, setResult] = useState<{
    pick: number;
    answerId: number;
    right: boolean;
    next: OooView;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(id: number) {
    start(async () => {
      const res = await oooAnswer(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setError(null);
      setResult({ pick: id, answerId: res.answer.id, right: res.right, next: res.next });
    });
  }

  function next() {
    if (result) setGame(result.next);
    setResult(null);
  }

  const streak = result ? result.next.streak : game.streak;
  const best = result ? result.next.best : game.best;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface-raised px-4 py-3">
        <span className="text-sm font-semibold text-ink-muted">
          Streak{" "}
          <span
            key={streak}
            className="tabular inline-block animate-pop text-xl font-black text-ink"
          >
            {streak}
          </span>
        </span>
        <span className="text-sm font-semibold text-ink-muted">
          Best <span className="tabular text-xl font-black text-gold-500">{best}</span>
        </span>
      </div>

      <section className="rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-center text-white shadow-xl shadow-blaugrana-950/30">
        <p className="text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Odd one out
        </p>
        <h2
          key={game.prompt}
          className="mt-1 animate-rise text-2xl leading-tight font-black text-balance"
        >
          {game.prompt}
        </h2>
      </section>

      <div className="grid grid-cols-2 gap-2">
        {game.options.map((o) => {
          const isAnswer = result?.answerId === o.id;
          const isPick = result?.pick === o.id;
          return (
            <button
              key={o.id}
              type="button"
              disabled={!!result || pending}
              onClick={() => pick(o.id)}
              className={cx(
                "flex min-h-20 animate-rise items-center justify-center rounded-2xl border p-3 text-center font-bold text-balance transition duration-150 active:scale-95",
                result
                  ? isAnswer
                    ? "animate-pop border-gold-400 bg-gold-400/20"
                    : isPick
                      ? "border-garnet-300 bg-garnet-500/15 text-ink-muted line-through"
                      : "border-line bg-surface-raised/60 text-ink-muted"
                  : "border-line bg-surface-raised hover:border-accent/60",
              )}
            >
              {o.name}
            </button>
          );
        })}
      </div>

      {result && (
        <div className="animate-rise space-y-3" aria-live="polite">
          <Notice tone={result.right ? "success" : "error"}>
            {result.right
              ? "Right! Streak +1."
              : `No — it was ${game.options.find((o) => o.id === result.answerId)?.name}. Streak reset.`}
          </Notice>
          <Button type="button" onClick={next} className="w-full" autoFocus>
            Next round →
          </Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
