"use client";

import { useEffect, useState } from "react";

import { Button, cx } from "./ui";

/** Bump the version to show an updated tour to everyone again. */
const SEEN_KEY = "culexi:tour:v1";
const OPEN_EVENT = "culexi:tour";

const STEPS = [
  {
    emoji: "👋",
    title: "Welcome to Culé XI",
    body: "Fantasy football for every Barça match, plus daily football trivia. Free, quick, and made for bragging rights.",
  },
  {
    emoji: "⚽",
    title: "Pick your XI",
    body: "In Fantasy, pick 11 from Barça and their opponent with 100 credits. Your captain scores double. Teams lock at kickoff.",
  },
  {
    emoji: "🔴",
    title: "Live points",
    body: "Points update during the match. After kickoff, tap League teams to see everyone's XI.",
  },
  {
    emoji: "🧠",
    title: "Daily trivia",
    body: "Eight games, from Culé Ten to Mystery Player. Missed a day? Play the last 15 days from the archive, just for fun.",
  },
  {
    emoji: "🏆",
    title: "Leaderboards",
    body: "Every game has today, this week and this month boards. You're in the Global league; add friends with an invite code.",
  },
  {
    emoji: "📲",
    title: "Make it yours",
    body: "In You, change your name, join a league and install the app. That's it, go cook 🔥",
  },
];

/** Opens the tour from anywhere (e.g. "Replay tour"). */
export function replayTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * A skippable first-visit tour (once per device; remembered in localStorage, which is just a
 * convenience — if it's unavailable the tour simply doesn't auto-open again this visit).
 */
export function AppTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage blocked: don't nag.
    }
    const timer = seen ? null : setTimeout(() => setOpen(true), 600);
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setStep((s) => Math.min(s + 1, STEPS.length - 1));
      if (e.key === "ArrowLeft") setStep((s) => Math.max(s - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Storage blocked: fine.
    }
  }

  if (!open) return null;
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-blaugrana-950/70 p-3 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="glow relative w-full max-w-md animate-rise overflow-hidden rounded-[2rem] bg-gradient-to-br from-blaugrana-700 via-blaugrana-900 to-garnet-900 p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-12 size-48 rounded-full bg-gold-500/25 blur-3xl"
        />
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-4 rounded-full px-3 py-1 text-xs font-bold text-white/70 hover:bg-white/10 hover:text-white"
        >
          Skip
        </button>
        <p key={step} aria-hidden className="animate-pop text-6xl">
          {s.emoji}
        </p>
        <h2 id="tour-title" className="mt-4 font-display text-3xl leading-tight font-extrabold">
          {s.title}
        </h2>
        <p className="mt-2 text-sm text-white/80">{s.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to step ${i + 1}`}
                onClick={() => setStep(i)}
                className={cx(
                  "h-2 rounded-full transition-all",
                  i === step ? "w-6 bg-gold-400" : "w-2 bg-white/30",
                )}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step - 1)}
                className="border-white/20 bg-white/10 text-white"
              >
                Back
              </Button>
            )}
            <Button type="button" autoFocus onClick={() => (last ? close() : setStep(step + 1))}>
              {last ? "Let's go ⚽" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Replay tour" button (on the You page). */
export function ReplayTourButton() {
  return (
    <Button type="button" variant="ghost" onClick={replayTour} className="w-full">
      🧭 Replay the app tour
    </Button>
  );
}
