"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { giveUpGame } from "@/app/actions/boards";
import { Button, Notice } from "@/components/ui";

/**
 * "Give up & reveal": ends the game and shows the answers. Asks first; on a live day the
 * score so far still counts.
 */
export function GiveUp({ game, archiveDay }: { game: string; archiveDay?: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="mx-auto block text-xs font-bold text-ink-muted underline decoration-dotted underline-offset-4 hover:text-garnet-500"
      >
        🏳️ Give up &amp; reveal answers
      </button>
    );
  }
  return (
    <div className="animate-rise space-y-2 rounded-2xl border border-garnet-300/50 bg-garnet-500/5 p-3 text-center">
      <p className="text-sm font-semibold">
        Reveal everything?{" "}
        <span className="font-normal text-ink-muted">
          {archiveDay ? "It's practice anyway." : "Your score so far still counts."}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="ghost" onClick={() => setAsking(false)} disabled={pending}>
          Keep playing
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await giveUpGame(game, archiveDay);
              if (!res.ok) setError(res.message);
              else router.refresh();
            })
          }
        >
          {pending ? "Revealing…" : "Reveal"}
        </Button>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
