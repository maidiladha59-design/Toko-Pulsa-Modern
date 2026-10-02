import { NetworkSkeleton } from "@/components/NetworkState";

export default function OrdersLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px]">
        <div className="h-3 w-24 animate-pulse rounded bg-app-inset" />
        <div className="mt-2 h-7 w-44 animate-pulse rounded bg-app-inset" />
        <div className="mt-1 h-4 w-56 animate-pulse rounded bg-app-inset" />
        <div className="mt-6 overflow-hidden rounded-2xl border border-app-border bg-app-surface" aria-busy="true">
          <NetworkSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
