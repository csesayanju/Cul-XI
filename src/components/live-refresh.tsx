"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While a match is live, re-fetches the page every `seconds` (only when the tab is visible),
 * so scores and points update on the go. Renders nothing.
 */
export function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}

/** A pulsing red "LIVE" tag. */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-black tracking-wide text-white">
      <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden />
      LIVE
    </span>
  );
}
