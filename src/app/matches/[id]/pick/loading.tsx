import { Skeleton, TitleSkeleton } from "@/components/skeleton";

/** Pitch-shaped placeholder so the team builder appears to open instantly. */
export default function Loading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading team builder">
      <TitleSkeleton />
      <div className="grid grid-cols-3 gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
      <div className="flex min-h-[28rem] flex-col justify-between rounded-3xl bg-green-800/60 p-4">
        {[2, 4, 4, 1].map((n, row) => (
          <div key={row} className="flex justify-evenly">
            {Array.from({ length: n }, (_, i) => (
              <Skeleton key={i} className="size-11 rounded-full bg-white/20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
