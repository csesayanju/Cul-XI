import { CardsSkeleton, Skeleton, TitleSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <TitleSkeleton />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>
      <CardsSkeleton count={1} height="h-64" />
    </>
  );
}
