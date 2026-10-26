import { CardsSkeleton, Skeleton, TitleSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <TitleSkeleton />
      <Skeleton className="mb-3 h-4 w-24" />
      <CardsSkeleton count={5} />
    </>
  );
}
