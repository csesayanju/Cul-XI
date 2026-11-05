/** Shown when the seat limit (public.app_limits) blocks a new account. */
export const FULL_MESSAGE =
  "Culé XI is full right now, so new accounts are paused. Ask whoever invited you to ping the admin.";

/** The seat-limit trigger surfaces from Supabase Auth as a generic "Database error ...". */
export const isSeatLimitError = (message: string) => /database error|CULEXI_FULL/i.test(message);
