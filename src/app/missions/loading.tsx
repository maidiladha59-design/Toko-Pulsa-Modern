import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function MissionsLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-24 animate-pulse rounded-3xl bg-app-inset" />
        <LoadingSkeleton rows={4} />
      </div>
    </div>
  );
}
