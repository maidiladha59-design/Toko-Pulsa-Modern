import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function TransferLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-3xl space-y-5" aria-busy="true" aria-live="polite">
        <div className="h-40 animate-pulse rounded-3xl bg-app-inset" />
        <div className="space-y-3 rounded-3xl border border-app-border bg-app-surface p-5">
          <div className="h-10 animate-pulse rounded-xl bg-app-inset" />
          <div className="h-10 animate-pulse rounded-xl bg-app-inset" />
          <div className="h-12 animate-pulse rounded-xl bg-app-inset" />
        </div>
        <LoadingSkeleton rows={2} />
      </div>
    </div>
  );
}
