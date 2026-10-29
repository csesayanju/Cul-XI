import type { ComponentProps, ReactNode } from "react";

/** Tiny set of shared UI primitives (Tailwind only, no component library). */

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-line bg-surface-raised p-4 shadow-[0_1px_2px_rgb(10_29_66/0.06),0_8px_24px_-12px_rgb(10_29_66/0.18)]",
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
        <p className="mb-1 text-xs font-bold tracking-[0.14em] text-accent uppercase">{eyebrow}</p>
      )}
      <h1 className="text-3xl font-black tracking-tight text-balance">{children}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-pretty text-ink-muted">{subtitle}</p>}
    </div>
  );
}

/** Small uppercase heading for a section of a page. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">{children}</h2>
      {aside && <span className="text-sm text-ink-muted">{aside}</span>}
    </div>
  );
}

const buttonStyles = {
  primary: "bg-accent text-accent-ink shadow-md shadow-accent/25 hover:brightness-110",
  secondary: "bg-brand text-brand-ink shadow-md shadow-brand/25 hover:brightness-110",
  ghost: "border border-line hover:bg-surface",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonStyles }) {
  return (
    <button
      className={cx(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition duration-150 select-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100",
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
        "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base transition outline-none placeholder:text-ink-muted/70 focus:border-accent focus:ring-4 focus:ring-accent/15",
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
