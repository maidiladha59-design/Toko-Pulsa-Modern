import { Skeleton } from "@/components/ui/LoadingSkeleton";

export default function ProductDetailLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-4" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
