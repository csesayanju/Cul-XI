import { cx } from "./ui";

/** Shimmering placeholder block shown while a page streams in. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-xl bg-line/60", className)} />;
}

/** Page title + subtitle placeholder. */
export function TitleSkeleton() {
  return (
    <div className="mb-5 space-y-2">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

/** A stack of card placeholders (match lists, tables…). */
export function CardsSkeleton({ count = 4, height = "h-20" }: { count?: number; height?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={height} />
      ))}
    </div>
  );
}
