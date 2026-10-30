/**
 * Missing XI — pure rules (no I/O). A famous starting line-up on a pitch: name the 11
 * players. Each slot shows the position and shirt number (and a flag once you're stuck);
 * 5 wrong guesses end the game.
 */

export const XI_LIVES = 5;

export interface XiSlot {
  pos: string;
  number: number | null;
  playerId: number;
  captain: boolean;
}

export interface XiGuess {
  playerId: number;
  /** Slot index found, or null for a wrong guess. */
  slot: number | null;
}

export interface XiState {
  guesses: XiGuess[];
  livesLeft: number;
  finished: boolean;
}

export const NEW_XI: XiState = { guesses: [], livesLeft: XI_LIVES, finished: false };

export type XiOutcome =
  { kind: "correct"; slot: number } | { kind: "wrong" } | { kind: "repeat" } | { kind: "over" };

export function applyXiGuess(
  slots: XiSlot[],
  state: XiState,
  playerId: number,
): { state: XiState; outcome: XiOutcome } {
  if (state.finished) return { state, outcome: { kind: "over" } };
  if (state.guesses.some((g) => g.playerId === playerId)) {
    return { state, outcome: { kind: "repeat" } };
  }
  const slot = slots.findIndex((s) => s.playerId === playerId);
  const guesses = [...state.guesses, { playerId, slot: slot >= 0 ? slot : null }];
  const found = guesses.filter((g) => g.slot != null).length;
  const livesLeft = slot >= 0 ? state.livesLeft : state.livesLeft - 1;
  return {
    state: { guesses, livesLeft, finished: found >= slots.length || livesLeft <= 0 },
    outcome: slot >= 0 ? { kind: "correct", slot } : { kind: "wrong" },
  };
}

/** Pitch lines from your own goal (0) to the opponent's (6). */
const LINE: Record<string, number> = {
  GK: 0,
  SW: 1,
  RB: 1,
  CB: 1,
  LB: 1,
  DF: 1,
  FB: 1,
  CH: 1,
  RWB: 2,
  LWB: 2,
  DM: 2,
  RH: 2,
  LH: 2,
  WH: 2,
  CM: 3,
  RM: 3,
  LM: 3,
  MF: 3,
  AM: 4,
  IR: 4,
  IL: 4,
  RW: 5,
  LW: 5,
  SS: 5,
  RF: 5,
  LF: 5,
  OR: 5,
  OL: 5,
  IF: 5,
  CF: 6,
  ST: 6,
  FW: 6,
};

/** -1 = left, 0 = centre, 1 = right (as the team attacks up the screen). */
const SIDE = (pos: string) => (/^L|^OL|^IL/.test(pos) ? -1 : /^R|^OR|^IR/.test(pos) ? 1 : 0);

/**
 * Where each slot sits on the pitch, in % (x: left→right, y: top→bottom with the goalkeeper
 * at the bottom). Players on the same line are spread out, left-sided ones on the left.
 */
export function layoutXI(positions: string[]): { x: number; y: number }[] {
  const lines = new Map<number, number[]>();
  positions.forEach((pos, i) => {
    const line = LINE[pos] ?? 3;
    lines.set(line, [...(lines.get(line) ?? []), i]);
  });
  const used = [...lines.keys()].sort((a, b) => a - b);
  const out: { x: number; y: number }[] = new Array(positions.length);
  used.forEach((line, row) => {
    const idx = [...lines.get(line)!].sort(
      (a, b) => SIDE(positions[a]!) - SIDE(positions[b]!) || a - b,
    );
    const y = used.length === 1 ? 50 : 90 - (row / (used.length - 1)) * 78;
    idx.forEach((i, k) => {
      out[i] = { x: Math.round(((k + 1) / (idx.length + 1)) * 100), y: Math.round(y) };
    });
  });
  return out;
}
