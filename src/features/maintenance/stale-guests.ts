export interface GuestUser {
  id: string;
  isAnonymous: boolean;
  createdAt: string;
}

/**
 * Guest accounts to delete: anonymous, older than `maxAgeMs`, and not "active" (never joined a
 * league or saved a team). Email/Google accounts are never selected.
 */
export function selectStaleGuests(
  users: GuestUser[],
  activeUserIds: ReadonlySet<string>,
  now: Date,
  maxAgeMs: number,
): string[] {
  const cutoff = now.getTime() - maxAgeMs;
  return users
    .filter((u) => u.isAnonymous)
    .filter((u) => !activeUserIds.has(u.id))
    .filter((u) => {
      const created = Date.parse(u.createdAt);
      return Number.isFinite(created) && created < cutoff;
    })
    .map((u) => u.id);
}
