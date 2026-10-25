import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function ProfileLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-5 lg:max-w-4xl" aria-busy="true" aria-live="polite">
        <div className="h-28 animate-pulse rounded-3xl border border-app-border bg-app-surface" />
        <div className="grid gap-3 sm:grid-cols-2">
          <LoadingSkeleton rows={4} />
          <LoadingSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
