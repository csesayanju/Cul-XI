"use client";

import { useState } from "react";

import { cx } from "./ui";

export function initialsOf(name: string) {
  return (
    name
      .replace(/[^\p{L}\s.-]/gu, "")
      .split(/[\s.-]+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

/**
 * Player photo (served by the data provider) with an initials fallback when there's no
 * photo or it fails to load. `starting` adds a green dot: in the confirmed starting XI.
 */
export function PlayerAvatar({
  starting,
  ...props
}: {
  name: string;
  photoUrl: string | null | undefined;
  barca: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  starting?: boolean;
}) {
  if (!starting) return <Avatar {...props} />;
  const dot = { sm: "size-3", md: "size-3.5", lg: "size-4" }[props.size ?? "md"];
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar {...props} />
      <span
        role="img"
        aria-label="In the starting XI"
        title="In the starting XI"
        className={cx(
          "absolute -right-0.5 -bottom-0.5 rounded-full bg-emerald-500 ring-2 ring-surface-raised",
          dot,
        )}
      />
    </span>
  );
}

function Avatar({
  name,
  photoUrl,
  barca,
  size = "md",
  className,
}: {
  name: string;
  photoUrl: string | null | undefined;
  barca: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dims = { sm: "size-9 text-xs", md: "size-11 text-sm", lg: "size-14 text-base" }[size];
  const ring = barca ? "ring-garnet-500" : "ring-line";

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote provider images, no optimisation needed
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cx(
          // Portrait photos: aim the crop at the upper part, where the face usually is.
          "shrink-0 rounded-full bg-surface object-cover object-[50%_20%] ring-2",
          dims,
          ring,
          className,
        )}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-2",
        barca
          ? "bg-gradient-to-br from-blaugrana-700 to-garnet-500 text-white"
          : "bg-line text-ink",
        dims,
        ring,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
