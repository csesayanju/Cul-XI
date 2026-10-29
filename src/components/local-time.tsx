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

/** Weekday / day / month stacked in a tile, in the viewer's timezone (UTC on the server). */
export function LocalDateTile({ iso, className = "" }: { iso: string; className?: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-GB", { ...o, ...(isClient ? {} : { timeZone: "UTC" }) }).format(
      date,
    );
  return (
    <time
      dateTime={iso}
      suppressHydrationWarning
      className={`flex w-12 shrink-0 flex-col items-center rounded-xl py-1.5 leading-none ${className}`}
    >
      <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">
        {part({ weekday: "short" })}
      </span>
      <span className="tabular mt-0.5 text-xl font-black">{part({ day: "numeric" })}</span>
      <span className="text-[10px] font-bold tracking-wider uppercase opacity-70">
        {part({ month: "short" })}
      </span>
    </time>
  );
}
