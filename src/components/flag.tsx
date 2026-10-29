import { cx } from "./ui";

/**
 * A country flag from flagcdn.com (public-domain SVGs). Emoji flags don't render on Windows,
 * so images are used instead; unknown codes fall back to a neutral chip.
 */
export function Flag({ code, className }: { code: string | null | undefined; className?: string }) {
  const valid = !!code && /^[A-Za-z]{2}$/.test(code);
  if (!valid) {
    return (
      <span
        aria-hidden
        className={cx("inline-block h-4 w-6 shrink-0 rounded-[3px] bg-line", className)}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs, no optimisation needed
    <img
      src={`https://flagcdn.com/${code.toLowerCase()}.svg`}
      alt=""
      width={24}
      height={16}
      loading="lazy"
      decoding="async"
      className={cx(
        "inline-block h-4 w-6 shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.12)]",
        className,
      )}
    />
  );
}
