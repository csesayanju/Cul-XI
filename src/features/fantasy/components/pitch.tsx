import type { ReactNode } from "react";

import type { Position } from "../types";

/** Rows from the top (attack) to the bottom (goal). */
const ROW_ORDER: Position[] = ["FWD", "MID", "DEF", "GK"];

/**
 * A football pitch with one row per position. Purely presentational: callers render the
 * slots (empty "+" buttons, picked players, points…), so it works in both the team builder
 * and the read-only post-kickoff view.
 */
export function Pitch({ rows }: { rows: Record<Position, ReactNode[]> }) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl border-4 border-white/20 px-2 py-4 shadow-inner"
      style={{
        background: "repeating-linear-gradient(180deg, #15803d 0 44px, #166534 44px 88px)",
      }}
    >
      {/* Markings */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-2 rounded-2xl border-2 border-white/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-2 top-1/2 border-t-2 border-white/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-2 left-1/2 h-14 w-2/5 -translate-x-1/2 border-2 border-b-0 border-white/35"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-2 left-1/2 h-14 w-2/5 -translate-x-1/2 border-2 border-t-0 border-white/35"
      />

      <div className="relative flex min-h-[26rem] flex-col justify-between gap-3">
        {ROW_ORDER.map((pos) => (
          <div key={pos} className="flex items-start justify-evenly gap-1" aria-label={pos}>
            {rows[pos]}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Short display name for pitch chips: the surname-ish last part. */
export function pitchName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : name;
}
