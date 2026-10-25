import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function TopupLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-24 animate-pulse rounded-3xl bg-app-inset" />
        <div className="space-y-3 rounded-3xl border border-app-border bg-app-surface p-5">
          <div className="h-12 animate-pulse rounded-xl bg-app-inset" />
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-app-inset" />
            ))}
          </div>
          <div className="h-12 animate-pulse rounded-xl bg-app-inset" />
        </div>
        <LoadingSkeleton rows={3} />
      </div>
    </div>
  );
}
