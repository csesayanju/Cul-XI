import type { ComponentProps, ReactNode } from "react";

/** Tiny set of shared UI primitives (Tailwind only, no component library). */

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-3xl border border-line bg-surface-raised p-4 shadow-[0_1px_2px_rgb(10_29_66/0.06),0_10px_30px_-14px_rgb(10_29_66/0.22)]",
        className,
      )}
      {...props}
    />
  );
}

export function PageTitle({
  children,
  subtitle,
  eyebrow,
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold tracking-[0.12em] text-accent uppercase">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-5xl">
        {children}
      </h1>
      {subtitle && (
        <p className="mt-2 max-w-prose text-sm text-pretty text-ink-muted">{subtitle}</p>
      )}
    </div>
  );
}

/** Small uppercase heading for a section of a page. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg font-extrabold tracking-tight">{children}</h2>
      {aside && <span className="text-sm text-ink-muted">{aside}</span>}
    </div>
  );
}

/** Chunky pills: a solid "ledge" shadow that the button presses into. */
const buttonStyles = {
  primary:
    "bg-gradient-to-b from-garnet-500 to-garnet-700 text-white shadow-[0_4px_0_0_#4a001f] hover:brightness-110 active:shadow-[0_1px_0_0_#4a001f] dark:from-garnet-300 dark:to-garnet-500 dark:text-blaugrana-950 dark:shadow-[0_4px_0_0_#7a0033]",
  secondary:
    "bg-gradient-to-b from-blaugrana-500 to-blaugrana-700 text-white shadow-[0_4px_0_0_#0a1d42] hover:brightness-110 active:shadow-[0_1px_0_0_#0a1d42]",
  ghost: "border-2 border-line bg-surface-raised hover:border-accent/50",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-extrabold tracking-tight transition duration-150 select-none active:translate-y-[3px] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-y-0",
        buttonStyles[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cx(
        "min-h-12 w-full rounded-2xl border-2 border-line bg-surface px-4 text-base transition outline-none placeholder:text-ink-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "garnet" | "gold" | "blue";
}) {
  const tones = {
    neutral: "bg-line/70 text-ink",
    garnet: "bg-garnet-500 text-white",
    gold: "bg-gold-400 text-blaugrana-950",
    blue: "bg-blaugrana-500 text-white",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error" | "success";
}) {
  const tones = {
    info: "border-blaugrana-300/60 bg-blaugrana-500/10 text-ink",
    error: "border-garnet-300/60 bg-garnet-500/10 text-ink",
    success: "border-gold-400/70 bg-gold-400/15 text-ink",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx("animate-rise rounded-xl border px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </p>
  );
}

/**
 * A bento tile: one tappable idea (a stat, a game, a shortcut). `hero` gets the gradient
 * border and glow — use one per screen.
 */
export function Tile({ className, hero, ...props }: ComponentProps<"div"> & { hero?: boolean }) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-3xl p-4 transition duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.98]",
        hero ? "gradient-border glow" : "border border-line bg-surface-raised",
        className,
      )}
      {...props}
    />
  );
}

/** A small rotated chip that looks stuck on ("🔥 3-day streak", "NEW", "LIVE"). */
export function Sticker({
  children,
  tone = "gold",
  tilt = -4,
  className,
}: {
  children: ReactNode;
  tone?: "gold" | "volt" | "garnet" | "blue";
  tilt?: number;
  className?: string;
}) {
  const tones = {
    gold: "bg-gold-400 text-blaugrana-950",
    volt: "bg-volt text-blaugrana-950",
    garnet: "bg-garnet-500 text-white",
    blue: "bg-blaugrana-500 text-white",
  };
  return (
    <span
      style={{ transform: `rotate(${tilt}deg)` }}
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black tracking-wide whitespace-nowrap uppercase shadow-[0_3px_0_0_rgb(0_0_0/0.25)]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
