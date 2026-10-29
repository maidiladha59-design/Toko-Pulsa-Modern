import { Skeleton } from "@/components/ui/LoadingSkeleton";

export default function RankingLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-5" aria-busy="true" aria-live="polite">
        <div className="app-hero rounded-[2rem] p-6">
          <div className="h-3 w-28 animate-pulse rounded bg-white/20" />
          <div className="mt-3 h-7 w-52 animate-pulse rounded bg-white/20" />
          <div className="mt-2 h-3.5 w-64 max-w-full animate-pulse rounded bg-white/15" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-app-border bg-app-surface p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
                <Skeleton className="h-3.5 w-20 shrink-0" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  );
}
