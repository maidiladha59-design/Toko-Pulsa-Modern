import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

export default function SettingsLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-[480px] space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-16 animate-pulse rounded-3xl bg-app-inset" />
        <LoadingSkeleton rows={4} />
        <LoadingSkeleton rows={3} />
      </div>
    </div>
  );
}
