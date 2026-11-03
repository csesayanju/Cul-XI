"use client";

import { useMemo } from "react";

const COLORS = ["#f6c94c", "#a50044", "#1f4fa3", "#c6ff3d", "#ffffff", "#d97a90"];

/** Deterministic confetti pieces from a seed (same on the server and the client). */
function makePieces(pieces: number, seed: number) {
  let x = seed;
  const rand = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  return Array.from({ length: pieces }, (_, i) => {
    const angle = rand() * Math.PI * 2;
    const dist = 90 + rand() * 170;
    return {
      i,
      color: COLORS[i % COLORS.length]!,
      dx: `${Math.round(Math.cos(angle) * dist)}px`,
      dy: `${Math.round(Math.sin(angle) * dist - 60)}px`,
      rot: `${Math.round(rand() * 720 - 360)}deg`,
      delay: `${Math.round(rand() * 120)}ms`,
      w: 6 + Math.round(rand() * 6),
      round: rand() > 0.6,
    };
  });
}

/**
 * A one-shot CSS confetti burst for wins (no library). Hidden with reduced motion.
 */
export function Confetti({ pieces = 36, seed = 7 }: { pieces?: number; seed?: number }) {
  const bits = useMemo(() => makePieces(pieces, seed), [pieces, seed]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-visible">
      <div className="absolute top-1/3 left-1/2">
        {bits.map((b) => (
          <span
            key={b.i}
            className="absolute block animate-confetti motion-reduce:hidden"
            style={
              {
                width: b.w,
                height: b.round ? b.w : b.w * 1.8,
                background: b.color,
                borderRadius: b.round ? 999 : 2,
                animationDelay: b.delay,
                "--dx": b.dx,
                "--dy": b.dy,
                "--rot": b.rot,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
