import { describe, expect, it } from "vitest";

import { fitToFormation, FORMATIONS, formationFor } from "./formations";
import { validateTeam } from "./validation/validate-team";

describe("formations", () => {
  it("lists exactly the formations the team rules allow", () => {
    expect(FORMATIONS.map((f) => f.name).sort()).toEqual(
      ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"].sort(),
    );
  });

  it("every listed formation passes team validation", () => {
    for (const f of FORMATIONS) {
      let id = 1;
      const players = (Object.keys(f.counts) as (keyof typeof f.counts)[]).flatMap((pos) =>
        Array.from({ length: f.counts[pos] }, () => ({
          playerId: id++,
          position: pos,
          teamId: id % 2,
          price: 8,
        })),
      );
      const result = validateTeam({ players, captainId: 1, viceCaptainId: 2 });
      expect(result.errors.filter((e) => e.code === "FORMATION")).toEqual([]);
    }
  });

  it("finds the formation for a saved team, falling back to 4-4-2", () => {
    expect(formationFor({ DEF: 3, MID: 5, FWD: 2 }).name).toBe("3-5-2");
    expect(formationFor({ DEF: 2, MID: 2, FWD: 2 }).name).toBe("4-4-2");
  });

  it("fits players into slots and returns the ones that no longer fit", () => {
    const f = formationFor({ DEF: 3, MID: 5, FWD: 2 });
    const { slots, dropped } = fitToFormation(f, {
      GK: [1],
      DEF: [2, 3, 4, 5],
      MID: [6, 7],
      FWD: [8, 9],
    });
    expect(slots).toEqual({
      GK: [1],
      DEF: [2, 3, 4],
      MID: [6, 7, null, null, null],
      FWD: [8, 9],
    });
    expect(dropped).toEqual([5]);
  });
});
