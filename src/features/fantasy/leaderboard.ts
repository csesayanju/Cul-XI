export interface PointsRow {
  userId: string;
  matchId: number;
  points: number;
}

export interface Standing {
  rank: number;
  userId: string;
  name: string;
  points: number;
  played: number;
}

/**
 * Ranks league members by total points (ties share a rank: 1, 2, 2, 4).
 * Members with no points yet are listed with 0. Pass rows for one match for a match table.
 */
export function buildStandings(
  rows: PointsRow[],
  members: ReadonlyMap<string, string>,
): Standing[] {
  const totals = new Map<string, { points: number; played: number }>();
  for (const id of members.keys()) totals.set(id, { points: 0, played: 0 });
  for (const row of rows) {
    const t = totals.get(row.userId);
    if (!t) continue; // not in this league
    t.points += row.points;
    t.played += 1;
  }

  const sorted = [...totals.entries()]
    .map(([userId, t]) => ({
      userId,
      name: members.get(userId) ?? "Unknown",
      points: Math.round(t.points * 10) / 10,
      played: t.played,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // Standard competition ranking: a player's rank is 1 + the number of players strictly ahead.
  return sorted.map((s) => ({
    ...s,
    rank: sorted.findIndex((o) => o.points === s.points) + 1,
  }));
}
