import { Skeleton } from "@/components/skeleton";

/** Career Path placeholder: title, game tabs, hero card and the club timeline. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-44" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-5 h-14" />
      <Skeleton className="mb-4 h-32 rounded-3xl" />
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-15 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
