import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function BantuanLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-28 animate-pulse rounded-3xl bg-app-inset" />
        <div className="h-12 animate-pulse rounded-2xl bg-app-inset" />
        <LoadingSkeleton rows={3} />
      </div>
    </div>
  );
}
