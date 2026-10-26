import { CardsSkeleton, TitleSkeleton } from "@/components/skeleton";

/** Shown instantly while any page without its own loading state streams in. */
export default function Loading() {
  return (
    <>
      <TitleSkeleton />
      <CardsSkeleton count={3} />
    </>
  );
}
