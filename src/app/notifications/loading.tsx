import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function NotificationsLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] lg:max-w-2xl" aria-busy="true" aria-live="polite">
        <div className="mb-5 space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-app-inset" />
          <div className="h-8 w-56 animate-pulse rounded bg-app-inset" />
        </div>
        <LoadingSkeleton rows={5} />
      </div>
    </div>
  );
}
