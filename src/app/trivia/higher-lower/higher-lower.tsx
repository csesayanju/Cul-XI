"use client";

import { useEffect, useRef, useState, useTransition } from "react";

import { holAnswer } from "@/app/actions/games";
import { Flag } from "@/components/flag";
import { Button, cx, Notice } from "@/components/ui";
import type { HolPick } from "@/features/higher-lower/game";
import type { HolView } from "@/features/higher-lower/server";

/** Counts up to `to` (a quick reveal), or shows it at once with reduced motion. */
function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    // With reduced motion the "animation" is a single frame.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 600;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = duration === 0 ? 1 : Math.min(1, (t - t0) / duration);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to]);
  return <>{n}</>;
}

function PlayerCard({
  name,
  countryCode,
  era,
  goals,
  tone,
  children,
}: {
  name: string;
  countryCode: string | null;
  era: string | null;
  goals: React.ReactNode;
  tone: "a" | "b";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cx(
        "flex min-h-52 flex-1 animate-rise flex-col items-center justify-center gap-2 rounded-3xl p-4 text-center text-white shadow-xl",
        tone === "a"
          ? "bg-gradient-to-br from-blaugrana-700 to-blaugrana-950 shadow-blaugrana-950/30"
          : "bg-gradient-to-br from-garnet-500 to-garnet-900 shadow-garnet-900/30",
      )}
    >
      <Flag code={countryCode} className="h-5 w-7" />
      <p className="text-lg leading-tight font-black text-balance">{name}</p>
      {era && <p className="text-xs font-semibold text-white/60">{era}</p>}
      <div className="mt-1">{goals}</div>
      {children}
    </div>
  );
}

/** Endless Higher or Lower on La Liga goals; the server judges every call. */
export function HigherLower({ initial }: { initial: HolView }) {
  const [game, setGame] = useState(initial);
  const [reveal, setReveal] = useState<{ bGoals: number; right: boolean; next: HolView } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function call(pick: HolPick) {
    start(async () => {
      const res = await holAnswer(pick);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setError(null);
      setReveal({ bGoals: res.revealed.bGoals, right: res.right, next: res.next });
    });
  }

  function next() {
    if (reveal) setGame(reveal.next);
    setReveal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface-raised px-4 py-3">
        <span className="text-sm font-semibold text-ink-muted">
          Streak{" "}
          <span
            key={game.streak}
            className="tabular inline-block animate-pop text-xl font-black text-ink"
          >
            {reveal?.right ? game.streak + 1 : reveal ? 0 : game.streak}
          </span>
        </span>
        <span className="text-sm font-semibold text-ink-muted">
          Best{" "}
          <span className="tabular text-xl font-black text-gold-500">
            {Math.max(game.best, reveal?.right ? game.streak + 1 : 0)}
          </span>
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerCard
          key={`a${game.a.id}`}
          tone="a"
          name={game.a.name}
          countryCode={game.a.countryCode}
          era={game.a.era}
          goals={
            <>
              <p className="tabular text-5xl font-black">{game.a.goals}</p>
              <p className="text-xs font-semibold text-white/70">La Liga goals</p>
            </>
          }
        />
        <div className="-my-1 flex justify-center sm:my-0 sm:items-center">
          <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-black text-ink-muted">
            VS
          </span>
        </div>
        <PlayerCard
          key={`b${game.b.id}`}
          tone="b"
          name={game.b.name}
          countryCode={game.b.countryCode}
          era={game.b.era}
          goals={
            reveal ? (
              <>
                <p className="tabular text-5xl font-black">
                  <CountUp to={reveal.bGoals} />
                </p>
                <p className="text-xs font-semibold text-white/70">La Liga goals</p>
              </>
            ) : (
              <p className="text-sm font-semibold text-white/80">scored … La Liga goals</p>
            )
          }
        >
          {!reveal && (
            <div className="mt-2 grid w-full grid-cols-2 gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => call("higher")}
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                ▲ More
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => call("lower")}
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                ▼ Fewer
              </Button>
            </div>
          )}
        </PlayerCard>
      </div>

      {reveal && (
        <div className="animate-rise space-y-3">
          <Notice tone={reveal.right ? "success" : "error"}>
            {reveal.right
              ? "Right! Keep going."
              : `Wrong — your streak ends at ${game.streak}. Fresh start.`}
          </Notice>
          <Button type="button" onClick={next} className="w-full" autoFocus>
            {reveal.right ? "Next player →" : "Play again"}
          </Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
