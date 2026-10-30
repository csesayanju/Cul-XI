"use client";

import { useState, useTransition } from "react";

import { mysteryGuess } from "@/app/actions/games";
import { Flag } from "@/components/flag";
import { cx, Notice } from "@/components/ui";
import type { Clue, Hit } from "@/features/mystery/game";
import type { MysteryView } from "@/features/mystery/server";
import { PlayerSearch } from "@/features/trivia/components/player-search";

const POS: Record<string, string> = { GK: "GK", DEF: "DEF", MID: "MID", FWD: "FWD" };

function Tile({
  label,
  hit,
  close,
  children,
}: {
  label: string;
  hit: Hit;
  close?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-h-16 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-center",
        hit === "yes"
          ? "bg-emerald-500 text-white"
          : close
            ? "bg-gold-400 text-blaugrana-950"
            : hit === "no"
              ? "bg-surface text-ink"
              : "bg-line/50 text-ink-muted",
      )}
    >
      <span className="text-[9px] font-bold tracking-wider uppercase opacity-75">{label}</span>
      <span className="mt-0.5 text-xs leading-tight font-black">{children}</span>
    </div>
  );
}

function ClueRow({ clue, fresh }: { clue: Clue; fresh: boolean }) {
  return (
    <li
      className={cx(
        "rounded-2xl border p-2.5",
        clue.correct ? "border-emerald-500 bg-emerald-500/10" : "border-line bg-surface-raised",
        fresh && "animate-rise",
      )}
    >
      <p className="mb-2 flex items-center gap-2 px-1 text-sm font-bold">
        <Flag code={clue.countryCode} className="h-3.5 w-5" />
        <span className="truncate">{clue.name}</span>
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        <Tile label="Nation" hit={clue.nation.hit}>
          <Flag code={clue.countryCode} className="h-3 w-4" />
        </Tile>
        <Tile label="Pos" hit={clue.position.hit}>
          {POS[clue.position.value ?? ""] ?? "?"}
        </Tile>
        <Tile label="Born" hit={clue.born.hit} close={clue.born.close}>
          <span className="tabular">
            {clue.born.value ?? "?"}
            {clue.born.arrow === "up" ? " ↑" : clue.born.arrow === "down" ? " ↓" : ""}
          </span>
        </Tile>
        <Tile label="Clubs" hit={clue.shared.hit}>
          <span className="line-clamp-2" title={clue.shared.clubs.join(", ")}>
            {clue.shared.clubs.length === 0
              ? "None"
              : clue.shared.clubs.length === 1
                ? clue.shared.clubs[0]
                : `${clue.shared.clubs.length} shared`}
          </span>
        </Tile>
        <Tile label="Barça" hit={clue.barca.hit}>
          {clue.barca.value ? "Yes" : "No"}
        </Tile>
      </div>
      {clue.shared.clubs.length > 1 && (
        <p className="mt-1.5 px-1 text-[11px] text-ink-muted">
          Shared clubs: {clue.shared.clubs.join(", ")}
        </p>
      )}
    </li>
  );
}

/** Mystery Player: guess the hidden player; every guess shows how close it is. */
export function Mystery({ initial }: { initial: MysteryView }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [pending, start] = useTransition();

  function guess(playerId: number) {
    start(async () => {
      const res = await mysteryGuess(playerId);
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
      <section className="rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <p className="text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Mystery Player
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-black">
          {game.answer ? (
            <span className="flex items-center gap-2">
              <Flag code={game.answer.countryCode} className="h-5 w-7" />
              {game.answer.name}
            </span>
          ) : (
            "Who is it?"
          )}
        </h2>
        <div className="mt-3 flex items-center justify-between text-xs font-semibold text-white/70">
          <span>A well-known La Liga player</span>
          <span className="tabular">{game.guessesLeft} guesses left</span>
        </div>
      </section>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-muted">
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-emerald-500 align-middle" />
          Match
        </span>
        <span>
          <span className="mr-1 inline-block size-2.5 rounded-sm bg-gold-400 align-middle" />
          Born within 3 years
        </span>
        <span>↑ born later · ↓ born earlier</span>
      </div>

      {!game.finished && (
        <div>
          <PlayerSearch
            onPick={(p) => guess(p.id)}
            disabled={pending}
            placeholder="Guess a player…"
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

      {game.clues.length > 0 && (
        <ol className="space-y-2">
          {[...game.clues].reverse().map((c, i) => (
            <ClueRow key={c.playerId} clue={c} fresh={i === 0} />
          ))}
        </ol>
      )}

      {game.finished && (
        <section className="animate-rise rounded-3xl border border-line bg-surface-raised p-5 text-center">
          <p className="text-4xl">{game.solved ? "🎯" : "🫣"}</p>
          <p className="mt-1 font-bold">
            {game.solved
              ? `Got him in ${game.clues.length} ${game.clues.length === 1 ? "guess" : "guesses"}!`
              : `It was ${game.answer?.name}.`}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            A new mystery arrives at midnight (India time).
          </p>
        </section>
      )}
    </div>
  );
}
