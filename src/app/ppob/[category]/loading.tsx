import { NetworkSkeleton } from "@/components/NetworkState";

export default function Loading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-3xl">
      <div className="h-9 w-40 animate-pulse rounded-xl bg-zinc-900" />
      <div className="mt-3 h-44 animate-pulse rounded-[2rem] bg-zinc-900" />
      <div className="mb-4 mt-7 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-zinc-800" />
        <div className="h-6 w-48 animate-pulse rounded bg-zinc-800" />
      </div>
      <NetworkSkeleton rows={6} />
      </div>
    </div>
  );
}
