import { Skeleton } from "@/components/skeleton";

/** Higher or Lower placeholder: title, game tabs, streak bar and the two player cards. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-52" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-5 h-14" />
      <Skeleton className="mb-4 h-14" />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-52 flex-1 rounded-3xl" />
        <Skeleton className="h-52 flex-1 rounded-3xl" />
      </div>
    </div>
  );
}
