import { Skeleton } from "@/components/skeleton";

/** Culé Ten placeholder: title, game tabs, hero card and ten slots. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-44" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-5 h-12" />
      <Skeleton className="mb-4 h-36 rounded-3xl" />
      <Skeleton className="mb-4 h-11" />
      <div className="space-y-2">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
