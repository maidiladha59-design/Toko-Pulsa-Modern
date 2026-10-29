import { Skeleton } from "@/components/ui/LoadingSkeleton";

export default function ProfileLoading() {
  return (
    <div className="customer-shell" aria-busy="true" aria-live="polite">
      <div className="mx-auto w-full max-w-[480px] space-y-5 lg:max-w-4xl">
        <section className="rounded-3xl border border-app-border bg-app-surface p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-3.5 w-28" />
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <Skeleton className="h-11 w-11 rounded-xl" />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-app-border bg-app-surface p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-app-border/60 px-2 py-3.5 last:border-0">
              <Skeleton className="h-9 w-9 shrink-0 rounded-xl" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="ml-auto h-3.5 w-10 shrink-0" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
