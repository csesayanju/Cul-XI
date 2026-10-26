import { describe, expect, it } from "vitest";

import { selectStaleGuests, type GuestUser } from "./stale-guests";

const now = new Date("2026-10-26T12:00:00Z");
const TWO_HOURS = 2 * 60 * 60 * 1000;
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

const users: GuestUser[] = [
  { id: "old-unused-guest", isAnonymous: true, createdAt: ago(180) },
  { id: "new-guest", isAnonymous: true, createdAt: ago(30) },
  { id: "old-guest-in-league", isAnonymous: true, createdAt: ago(600) },
  { id: "old-guest-with-team", isAnonymous: true, createdAt: ago(600) },
  { id: "old-email-user", isAnonymous: false, createdAt: ago(10_000) },
  { id: "bad-date-guest", isAnonymous: true, createdAt: "not a date" },
];
const active = new Set(["old-guest-in-league", "old-guest-with-team"]);

describe("selectStaleGuests", () => {
  it("selects only old, unused guest accounts", () => {
    expect(selectStaleGuests(users, active, now, TWO_HOURS)).toEqual(["old-unused-guest"]);
  });

  it("keeps guests younger than the age limit", () => {
    const justUnder = [{ id: "g", isAnonymous: true, createdAt: ago(119) }];
    const justOver = [{ id: "g", isAnonymous: true, createdAt: ago(121) }];
    expect(selectStaleGuests(justUnder, new Set(), now, TWO_HOURS)).toEqual([]);
    expect(selectStaleGuests(justOver, new Set(), now, TWO_HOURS)).toEqual(["g"]);
  });

  it("never selects email or Google accounts", () => {
    expect(selectStaleGuests(users, new Set(), now, 0)).not.toContain("old-email-user");
  });
});
