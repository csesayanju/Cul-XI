import type { ComponentProps, ReactNode } from "react";

/** Tiny set of shared UI primitives (Tailwind only, no component library). */

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cx("rounded-2xl border border-line bg-surface-raised p-4 shadow-sm", className)}
      {...props}
    />
  );
}

export function PageTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-black tracking-tight">{children}</h1>
      {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}

const buttonStyles = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "bg-brand text-brand-ink hover:opacity-90",
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
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
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
        "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:ring-2 focus:ring-accent",
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
    neutral: "bg-line text-ink",
    garnet: "bg-garnet-500 text-white",
    gold: "bg-gold-400 text-blaugrana-950",
    blue: "bg-blaugrana-500 text-white",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
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
    info: "border-blaugrana-300 bg-blaugrana-50 text-blaugrana-900",
    error: "border-garnet-300 bg-garnet-100 text-garnet-900",
    success: "border-gold-400 bg-gold-300/40 text-blaugrana-950",
  };
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cx("rounded-xl border px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </p>
  );
}

/** Player initials avatar — no photos or club imagery are used anywhere. */
export function Initials({ name, barca }: { name: string; barca: boolean }) {
  const initials = name
    .replace(/[^\p{L}\s.-]/gu, "")
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        barca
          ? "bg-gradient-to-br from-blaugrana-700 to-garnet-500 text-white"
          : "bg-line text-ink",
      )}
    >
      {initials || "?"}
    </span>
  );
}
