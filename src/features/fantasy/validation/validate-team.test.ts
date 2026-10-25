import { describe, expect, it } from "vitest";

import type { Position } from "../types";
import { validateTeam, type SelectablePlayer, type TeamSelection } from "./validate-team";

const BARCA = 529;
const OPP = 9001;

let nextId = 1;
const player = (position: Position, teamId = BARCA, price = 8): SelectablePlayer => ({
  playerId: nextId++,
  position,
  teamId,
  price,
});

/** A valid 1-4-4-2 XI: 6 Barça + 5 opponent, 88 credits, captain = first MID. */
function validXI(): TeamSelection {
  const players = [
    player("GK", OPP),
    player("DEF"),
    player("DEF"),
    player("DEF", OPP),
    player("DEF", OPP),
    player("MID"),
    player("MID"),
    player("MID", OPP),
    player("MID", OPP),
    player("FWD"),
    player("FWD"),
  ];
  return { players, captainId: players[5]!.playerId, viceCaptainId: players[9]!.playerId };
}

const codes = (sel: TeamSelection, opts?: Parameters<typeof validateTeam>[1]) =>
  validateTeam(sel, opts).errors.map((e) => e.code);

describe("validateTeam", () => {
  it("accepts a valid XI and reports totals", () => {
    const result = validateTeam(validXI(), { allowedTeamIds: [BARCA, OPP] });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.totalCost).toBe(88);
    expect(result.remainingBudget).toBe(12);
    expect(result.countsByPosition).toEqual({ GK: 1, DEF: 4, MID: 4, FWD: 2 });
    expect(result.countsByTeam).toEqual({ [BARCA]: 6, [OPP]: 5 });
  });

  describe("squad size", () => {
    it("rejects fewer than 11 players", () => {
      const sel = validXI();
      sel.players = sel.players.filter(
        (p) => p.position !== "FWD" || p.playerId === sel.viceCaptainId,
      );
      expect(codes(sel)).toContain("SQUAD_SIZE");
    });

    it("rejects more than 11 players", () => {
      const sel = validXI();
      sel.players.push(player("MID", OPP, 1));
      expect(codes(sel)).toContain("SQUAD_SIZE");
    });

    it("rejects duplicate players", () => {
      const sel = validXI();
      sel.players[10] = { ...sel.players[9]! };
      expect(codes(sel)).toContain("DUPLICATE_PLAYER");
    });
  });

  describe("budget", () => {
    it("accepts exactly 100 credits", () => {
      const sel = validXI();
      sel.players[0]!.price += 12; // 88 -> 100
      expect(validateTeam(sel).valid).toBe(true);
    });

    it("rejects 100.5 credits", () => {
      const sel = validXI();
      sel.players[0]!.price += 12.5;
      const result = validateTeam(sel);
      expect(result.errors.map((e) => e.code)).toEqual(["OVER_BUDGET"]);
      expect(result.remainingBudget).toBe(-0.5);
    });

    it("avoids floating-point drift with decimal prices", () => {
      const sel = validXI();
      // 11 x 9.1 = 100.1 in exact arithmetic; 10 x 9.1 + 9.0 = 100.0
      sel.players.forEach((p) => (p.price = 9.1));
      sel.players[0]!.price = 9.0;
      expect(validateTeam(sel).totalCost).toBe(100);
      expect(validateTeam(sel).valid).toBe(true);
    });
  });

  describe("max players per team", () => {
    it("accepts 7 from one team", () => {
      const sel = validXI();
      sel.players[3]!.teamId = BARCA; // 7 Barça
      expect(validateTeam(sel).valid).toBe(true);
    });

    it("rejects 8 from one team", () => {
      const sel = validXI();
      sel.players[3]!.teamId = BARCA;
      sel.players[4]!.teamId = BARCA; // 8 Barça
      expect(codes(sel)).toEqual(["TOO_MANY_FROM_TEAM"]);
    });

    it("applies the limit to the opponent as well", () => {
      const sel = validXI();
      sel.players[1]!.teamId = OPP;
      sel.players[2]!.teamId = OPP;
      sel.players[6]!.teamId = OPP; // 8 opponent
      expect(codes(sel)).toEqual(["TOO_MANY_FROM_TEAM"]);
    });

    it("rejects players from a club not in this match", () => {
      const sel = validXI();
      sel.players[1]!.teamId = 1234;
      expect(codes(sel, { allowedTeamIds: [BARCA, OPP] })).toEqual(["PLAYER_NOT_IN_MATCH"]);
    });
  });

  describe("formation", () => {
    const withPositions = (positions: Position[]): TeamSelection => {
      const players = positions.map((pos, i) => player(pos, i < 6 ? BARCA : OPP, 8));
      return {
        players,
        captainId: players[1]!.playerId,
        viceCaptainId: players[2]!.playerId,
      };
    };
    const shape = (gk: number, def: number, mid: number, fwd: number): Position[] => [
      ...Array<Position>(gk).fill("GK"),
      ...Array<Position>(def).fill("DEF"),
      ...Array<Position>(mid).fill("MID"),
      ...Array<Position>(fwd).fill("FWD"),
    ];

    it.each([
      [1, 4, 4, 2],
      [1, 4, 3, 3],
      [1, 3, 5, 2],
      [1, 5, 4, 1],
      [1, 5, 3, 2],
      [1, 3, 4, 3],
      [1, 4, 5, 1],
    ])("accepts %i-%i-%i-%i", (gk, def, mid, fwd) => {
      expect(validateTeam(withPositions(shape(gk, def, mid, fwd))).valid).toBe(true);
    });

    it.each([
      ["no goalkeeper", 0, 4, 4, 3],
      ["two goalkeepers", 2, 4, 3, 2],
      ["too few defenders", 1, 2, 5, 3],
      ["too many defenders", 1, 6, 3, 1],
      ["too few midfielders", 1, 5, 2, 3],
      ["too many midfielders", 1, 3, 6, 1],
      ["no forwards", 1, 5, 5, 0],
      ["too many forwards", 1, 3, 3, 4],
    ])("rejects %s", (_label, gk, def, mid, fwd) => {
      expect(codes(withPositions(shape(gk, def, mid, fwd)))).toContain("FORMATION");
    });

    it("explains the formation problem", () => {
      const result = validateTeam(withPositions(shape(2, 4, 3, 2)));
      expect(result.errors.find((e) => e.code === "FORMATION")?.message).toBe(
        "You need 1 GK (you have 2).",
      );
    });
  });

  describe("captain and vice-captain", () => {
    it("requires a captain", () => {
      expect(codes({ ...validXI(), captainId: null })).toEqual(["CAPTAIN_MISSING"]);
    });

    it("requires a vice-captain", () => {
      expect(codes({ ...validXI(), viceCaptainId: null })).toEqual(["VICE_CAPTAIN_MISSING"]);
    });

    it("requires the captain to be in the XI", () => {
      expect(codes({ ...validXI(), captainId: 99999 })).toEqual(["CAPTAIN_NOT_IN_TEAM"]);
    });

    it("requires the vice-captain to be in the XI", () => {
      expect(codes({ ...validXI(), viceCaptainId: 99999 })).toEqual(["VICE_CAPTAIN_NOT_IN_TEAM"]);
    });

    it("rejects the same player as captain and vice-captain", () => {
      const sel = validXI();
      expect(codes({ ...sel, viceCaptainId: sel.captainId })).toEqual(["CAPTAIN_IS_VICE_CAPTAIN"]);
    });
  });

  it("reports every problem at once", () => {
    const result = validateTeam({ players: [], captainId: null, viceCaptainId: null });
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        "SQUAD_SIZE",
        "FORMATION",
        "CAPTAIN_MISSING",
        "VICE_CAPTAIN_MISSING",
      ]),
    );
  });
});
