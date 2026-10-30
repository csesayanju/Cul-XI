export interface GuestUser {
  id: string;
  isAnonymous: boolean;
  createdAt: string;
  /** Last time the app saw them (profiles.last_seen_at), if known. */
  lastSeenAt: string | null;
}

/**
 * Guest accounts to delete: anonymous and not seen for `maxIdleMs` (the latest of when they
 * were created and when they were last seen). Email/Google accounts are never selected.
 */
export function selectStaleGuests(users: GuestUser[], now: Date, maxIdleMs: number): string[] {
  const cutoff = now.getTime() - maxIdleMs;
  return users
    .filter((u) => u.isAnonymous)
    .filter((u) => {
      const times = [u.createdAt, u.lastSeenAt]
        .map((t) => Date.parse(t ?? ""))
        .filter(Number.isFinite);
      return times.length > 0 && Math.max(...times) < cutoff;
    })
    .map((u) => u.id);
}
