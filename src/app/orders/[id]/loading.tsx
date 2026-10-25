import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function OrderDetailLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-5 lg:max-w-4xl" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 animate-pulse rounded-2xl bg-app-inset" />
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-app-inset" />
            <div className="h-6 w-48 animate-pulse rounded bg-app-inset" />
          </div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
          <LoadingSkeleton rows={4} />
          <div className="h-64 animate-pulse rounded-3xl border border-app-border bg-app-surface" />
        </div>
      </div>
    </div>
  );
}
