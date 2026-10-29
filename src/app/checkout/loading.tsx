import { Skeleton } from "@/components/ui/LoadingSkeleton";

export default function CheckoutLoading() {
  return (
    <div className="mx-auto w-full max-w-[480px] space-y-5 px-4 py-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-14 w-2/3 rounded-xl" />
      <Skeleton className="h-32 rounded-3xl" />
      <Skeleton className="h-64 rounded-3xl" />
      <Skeleton className="h-40 rounded-3xl" />
    </div>
  );
}
