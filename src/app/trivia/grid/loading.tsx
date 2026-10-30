import { Skeleton } from "@/components/skeleton";

/** Tiki-Taka-Toe placeholder: title, game tabs, hero card and the 3×3 grid. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="mb-2 h-8 w-52" />
      <Skeleton className="mb-6 h-4 w-72" />
      <Skeleton className="mb-5 h-12" />
      <Skeleton className="mb-4 h-32 rounded-3xl" />
      <div className="grid grid-cols-[minmax(0,0.8fr)_repeat(3,minmax(0,1fr))] gap-1.5 sm:gap-2">
        <div />
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={`c${i}`} className="mx-auto mb-1 size-10 rounded-full" />
        ))}
        {Array.from({ length: 3 }, (_, r) => (
          <div key={r} className="contents">
            <Skeleton className="m-auto size-10 rounded-full" />
            {Array.from({ length: 3 }, (_, c) => (
              <Skeleton key={c} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
