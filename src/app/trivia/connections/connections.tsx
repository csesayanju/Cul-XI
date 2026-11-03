"use client";

import { useState, useTransition } from "react";

import { connectionsGuess } from "@/app/actions/games";
import { Confetti } from "@/components/confetti";
import { Button, cx, Notice } from "@/components/ui";
import { GiveUp } from "@/app/trivia/give-up";
import type { ConnectionsView } from "@/features/connections/server";

/** Group colours, easiest look first (by the order groups are revealed). */
const GROUP_TONES = [
  "bg-gold-400 text-blaugrana-950",
  "bg-emerald-500 text-white",
  "bg-blaugrana-500 text-white",
  "bg-garnet-500 text-white",
];

/**
 * Connections: 16 players, 4 hidden groups; tap four and submit. No flags on the tiles —
 * nationality is one of the groups.
 */
export function Connections({
  initial,
  archiveDay,
}: {
  initial: ConnectionsView;
  /** Set when playing a past day from the archive (practice). */
  archiveDay?: string;
}) {
  const [game, setGame] = useState(initial);
  const [picked, setPicked] = useState<number[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  /** The four tiles of the last wrong guess: they shake and flash, then clear. */
  const [missed, setMissed] = useState<number[]>([]);
  /** Wrong combinations already tried (the same four can't be submitted twice). */
  const [tried, setTried] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const comboKey = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
  const toggle = (id: number) => {
    setMissed([]);
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 4 ? [...p, id] : p));
  };

  function submit() {
    const pick = picked;
    if (tried.includes(comboKey(pick))) {
      setMessage({ text: "You've already tried those four.", tone: "info", key: Date.now() });
      return;
    }
    start(async () => {
      const res = await connectionsGuess(pick, archiveDay);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      if (res.tone === "error") {
        // Wrong: only the picked tiles shake; the board itself stays as it is.
        setMissed(pick);
        setTried((t) => [...t, comboKey(pick)]);
      }
      setPicked([]);
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface-raised px-4 py-3 text-sm">
        <span className="font-semibold text-ink-muted">Find 4 groups of 4</span>
        <span
          className="flex items-center gap-1.5 font-semibold text-ink-muted"
          aria-label={`${game.mistakesLeft} mistakes left`}
        >
          Mistakes
          {Array.from({ length: 4 }, (_, i) => (
            <span
              key={i}
              className={cx(
                "size-2.5 rounded-full transition-colors",
                i < game.mistakesLeft ? "bg-garnet-500" : "bg-line",
              )}
            />
          ))}
        </span>
      </div>

      <div className="space-y-2">
        {game.groups.map((g, i) => (
          <div
            key={g.index}
            className={cx(
              "animate-pop rounded-2xl p-3 text-center",
              GROUP_TONES[i % GROUP_TONES.length],
              !g.found && "opacity-70",
            )}
          >
            <p className="text-sm font-black tracking-wide uppercase">{g.label}</p>
            <p className="mt-0.5 text-xs font-semibold opacity-90">{g.players.join(" · ")}</p>
          </div>
        ))}
      </div>

      {message && (
        <div key={message.key} aria-live="polite">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {game.tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {game.tiles.map((t) => {
            const on = picked.includes(t.id);
            const miss = missed.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={game.finished || pending}
                aria-pressed={on}
                onClick={() => toggle(t.id)}
                className={cx(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl border p-2 text-center text-sm leading-tight font-bold transition duration-150 active:scale-95",
                  on
                    ? "border-transparent bg-brand text-brand-ink shadow-md shadow-brand/25"
                    : miss
                      ? "animate-shake border-garnet-500 bg-garnet-500/15"
                      : "border-line bg-surface-raised hover:border-accent/50",
                )}
              >
                <span className="line-clamp-2">{t.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {!game.finished && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={picked.length === 0 || pending}
            onClick={() => setPicked([])}
          >
            Clear
          </Button>
          <Button type="button" disabled={picked.length !== 4 || pending} onClick={submit}>
            {pending ? "Checking…" : `Submit${picked.length ? ` (${picked.length}/4)` : ""}`}
          </Button>
        </div>
      )}

      {game.finished && game.groups.every((g) => g.found) && (
        <div className="relative h-0">
          <Confetti />
        </div>
      )}
      {game.finished && (
        <p className="text-center text-sm text-ink-muted">
          A new puzzle arrives at midnight (India time).
        </p>
      )}
      {!game.finished && <GiveUp game="connections" archiveDay={archiveDay} />}
    </div>
  );
}
