import { NetworkSkeleton } from "@/components/NetworkState";

export default function TransactionsLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-6">
        <div className="space-y-2">
          <div className="h-3.5 w-36 animate-pulse rounded bg-app-inset" />
          <div className="h-8 w-72 max-w-full animate-pulse rounded bg-app-inset" />
          <div className="h-3.5 w-full max-w-xl animate-pulse rounded bg-app-inset/70" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[72px] animate-pulse rounded-2xl border border-app-border bg-app-surface" />
          ))}
        </div>
        <NetworkSkeleton rows={6} />
      </div>
    </div>
  );
}
