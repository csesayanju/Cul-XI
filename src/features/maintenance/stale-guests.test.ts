import { describe, expect, it } from "vitest";

import { selectStaleGuests, type GuestUser } from "./stale-guests";

const now = new Date("2026-10-31T12:00:00Z");
const WEEK = 7 * 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

const guest = (id: string, created: number, seen: number | null): GuestUser => ({
  id,
  isAnonymous: true,
  createdAt: daysAgo(created),
  lastSeenAt: seen == null ? null : daysAgo(seen),
});

describe("selectStaleGuests", () => {
  it("deletes only guests not seen for 7 days", () => {
    const users = [
      guest("away-8-days", 30, 8),
      guest("seen-yesterday", 30, 1),
      guest("new-never-seen", 2, null),
      guest("old-never-seen", 10, null),
      { id: "google-user", isAnonymous: false, createdAt: daysAgo(100), lastSeenAt: daysAgo(100) },
    ];
    expect(selectStaleGuests(users, now, WEEK)).toEqual(["away-8-days", "old-never-seen"]);
  });

  it("uses the 7-day boundary", () => {
    expect(selectStaleGuests([guest("g", 30, 6.9)], now, WEEK)).toEqual([]);
    expect(selectStaleGuests([guest("g", 30, 7.1)], now, WEEK)).toEqual(["g"]);
  });

  it("never deletes on unreadable dates", () => {
    const bad = { id: "bad", isAnonymous: true, createdAt: "not a date", lastSeenAt: null };
    expect(selectStaleGuests([bad], now, WEEK)).toEqual([]);
  });
});
