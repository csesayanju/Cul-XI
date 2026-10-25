"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Renders a timestamp in the viewer's own timezone (server render falls back to UTC). */
export function LocalTime({ iso, withDate = true }: { iso: string; withDate?: boolean }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    ...(withDate ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    ...(isClient ? {} : { timeZone: "UTC", timeZoneName: "short" }),
  };
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {new Intl.DateTimeFormat(undefined, options).format(date)}
    </time>
  );
}
