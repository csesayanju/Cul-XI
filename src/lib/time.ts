/** True once a match's kickoff time has passed (evaluated at request time on the server). */
export function hasKickedOff(kickoffIso: string, now: number = Date.now()): boolean {
  return new Date(kickoffIso).getTime() <= now;
}
