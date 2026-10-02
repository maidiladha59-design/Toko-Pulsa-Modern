import { NetworkSkeleton } from "@/components/NetworkState";

export default function WalletLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px]" aria-busy="true">
        <div className="app-hero rounded-[2rem] p-6">
          <div className="h-3.5 w-40 animate-pulse rounded bg-white/20" />
          <div className="mt-2 h-9 w-56 animate-pulse rounded bg-white/20" />
          <div className="mt-4 flex flex-wrap gap-2">
            <div className="h-10 w-36 animate-pulse rounded-lg bg-white/20" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-white/20" />
            <div className="h-10 w-28 animate-pulse rounded-lg bg-white/20" />
          </div>
        </div>
        <div className="mt-8 h-5 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="mt-3">
          <NetworkSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
