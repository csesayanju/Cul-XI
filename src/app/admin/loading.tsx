import { CardsSkeleton, TitleSkeleton } from "@/components/skeleton";

export default function Loading() {
  return (
    <>
      <TitleSkeleton />
      <CardsSkeleton count={2} height="h-48" />
    </>
  );
}
