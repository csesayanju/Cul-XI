"use client";

import { useState, useTransition } from "react";

import { careerGuess } from "@/app/actions/games";
import { Flag } from "@/components/flag";
import { cx, Notice } from "@/components/ui";
import type { CareerView } from "@/features/career/server";
import { PlayerSearch } from "@/features/trivia/components/player-search";

const POSITIONS: Record<string, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

const years = (from: number | null, to: number | null) =>
  from == null ? "?" : to == null ? `${from}–` : from === to ? `${from}` : `${from}–${to}`;

function Monogram({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => !/^(FC|CF|CD|UD|SD|RC|RCD|de|AC|AS|SS|SC)$/i.test(w))
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blaugrana-500 to-blaugrana-900 text-[11px] font-black text-white shadow-md">
      {letters || "?"}
    </span>
  );
}

/** The daily Career Path: a club timeline, 5 guesses, a new hint after each miss. */
export function CareerPath({ initial }: { initial: CareerView }) {
  const [game, setGame] = useState(initial);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error" | "info";
    key: number;
  } | null>(null);
  const [pending, start] = useTransition();

  function guess(playerId: number) {
    start(async () => {
      const res = await careerGuess(playerId);
      if (!res.ok) {
        setMessage({ text: res.message, tone: "error", key: Date.now() });
        return;
      }
      setGame(res.game);
      setMessage({ text: res.message, tone: res.tone, key: Date.now() });
    });
  }

  const hints = [
    game.hints.nationality && {
      label: "Nationality",
      value: (
        <span className="flex items-center gap-1.5">
          <Flag code={game.hints.nationality.code} />
          {game.hints.nationality.name ?? "?"}
        </span>
      ),
    },
    game.hints.position !== undefined && {
      label: "Position",
      value: POSITIONS[game.hints.position ?? ""] ?? "?",
    },
    game.hints.born !== undefined && { label: "Born", value: game.hints.born ?? "?" },
    game.hints.initial && { label: "Name starts with", value: game.hints.initial },
  ].filter(Boolean) as { label: string; value: React.ReactNode }[];

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-5 text-white shadow-xl shadow-blaugrana-950/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-gold-500/20 blur-3xl"
        />
        <p className="relative text-[11px] font-bold tracking-[0.16em] text-gold-400 uppercase">
          Career Path
        </p>
        <h2 className="relative mt-1 text-2xl leading-tight font-black">
          {game.answer ? (
            <span className="flex items-center gap-2">
              <Flag code={game.answer.countryCode} className="h-5 w-7" />
              {game.answer.name}
            </span>
          ) : (
            "Who am I?"
          )}
        </h2>
        <div className="relative mt-3 flex items-center justify-between text-xs font-semibold text-white/70">
          <span>
            {game.spells.length} clubs ·{" "}
            {years(game.spells[0]?.from ?? null, game.spells.at(-1)?.to ?? null)}
          </span>
          <span className="flex gap-1" aria-label={`${game.guessesLeft} guesses left`}>
            {Array.from({ length: 5 }, (_, i) => (
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

      <ol className="relative space-y-2 before:absolute before:top-5 before:bottom-5 before:left-[1.65rem] before:w-0.5 before:bg-line">
        {game.spells.map((s, i) => (
          <li
            key={i}
            className="relative flex animate-rise items-center gap-3 rounded-2xl border border-line bg-surface-raised p-2.5 pr-3"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {s.logo ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white p-1 shadow-md ring-1 ring-black/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- small Commons thumbnails */}
                <img src={s.logo} alt="" width={32} height={32} className="size-8 object-contain" />
              </span>
            ) : (
              <Monogram name={s.club} />
            )}
            <span className="min-w-0 flex-1 truncate font-bold">{s.club}</span>
            <span className="tabular shrink-0 text-sm font-semibold text-ink-muted">
              {years(s.from, s.to)}
            </span>
          </li>
        ))}
      </ol>

      {hints.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {hints.map((h) => (
            <div
              key={h.label}
              className="animate-rise rounded-2xl border border-gold-400/40 bg-gold-400/10 p-3"
            >
              <p className="text-[11px] font-bold tracking-wide text-ink-muted uppercase">
                {h.label}
              </p>
              <p className="mt-0.5 font-bold">{h.value}</p>
            </div>
          ))}
        </div>
      )}

      {!game.finished && (
        <div>
          <PlayerSearch onPick={(p) => guess(p.id)} disabled={pending} placeholder="Who is it?" />
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

      {game.guesses.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-ink-muted">Your guesses</span>
          {game.guesses.map((g) => {
            const right = game.solved && g.id === game.guesses.at(-1)?.id;
            return (
              <span
                key={g.id}
                className={cx(
                  "flex items-center gap-1 rounded-full border px-2 py-0.5",
                  right
                    ? "border-gold-400 bg-gold-400/15 font-bold"
                    : "border-garnet-300/50 text-ink-muted line-through",
                )}
              >
                <Flag code={g.countryCode} className="h-3 w-4" />
                {g.name}
              </span>
            );
          })}
        </div>
      )}

      {game.finished && (
        <section className="animate-rise rounded-3xl border border-line bg-surface-raised p-5 text-center">
          <p className="text-4xl">{game.solved ? "🎯" : "🫣"}</p>
          <p className="mt-1 font-bold">
            {game.solved
              ? `Solved in ${game.guesses.length} ${game.guesses.length === 1 ? "guess" : "guesses"}!`
              : `It was ${game.answer?.name}.`}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            A new career arrives at midnight (India time).
          </p>
        </section>
      )}
    </div>
  );
}
