import { describe, expect, it } from "vitest";

import { injuryLabel, isUnavailable, type Injury } from "./availability";

const now = new Date("2026-10-26T12:00:00Z");
const olmo: Injury = { reason: "Torn muscle fiber", from: "2026-10-21", until: "2026-11-16" };

describe("isUnavailable", () => {
  it("blocks players with a current injury", () => {
    expect(isUnavailable(olmo, null, now)).toBe(true);
  });

  it("counts the expected return day as still out, and the day after as fit", () => {
    expect(isUnavailable({ ...olmo, until: "2026-10-26" }, null, now)).toBe(true);
    expect(isUnavailable({ ...olmo, until: "2026-10-25" }, null, now)).toBe(false);
  });

  it("treats an injury without a return date as current", () => {
    expect(isUnavailable({ ...olmo, until: null }, null, now)).toBe(true);
  });

  it("lets fit players through", () => {
    expect(isUnavailable(null, null, now)).toBe(false);
  });

  it("follows admin overrides", () => {
    expect(isUnavailable(olmo, "fit", now)).toBe(false);
    expect(isUnavailable(null, "injured", now)).toBe(true);
  });
});

describe("injuryLabel", () => {
  it("shows the return date and reason", () => {
    expect(injuryLabel(olmo)).toBe("Injured until 16 Nov · Torn muscle fiber");
  });

  it("omits unknown details", () => {
    expect(injuryLabel({ reason: "Unknown", from: null, until: null })).toBe("Injured");
    expect(injuryLabel(null, "injured")).toBe("Unavailable");
  });
});
