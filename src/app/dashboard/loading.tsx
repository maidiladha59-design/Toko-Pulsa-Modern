import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function DashboardLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-5 lg:max-w-5xl" aria-busy="true" aria-live="polite">
        <div className="h-48 animate-pulse rounded-3xl bg-app-inset" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-3xl border border-app-border bg-app-surface" />
          ))}
        </div>
        <LoadingSkeleton rows={3} />
      </div>
    </div>
  );
}
