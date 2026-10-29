import { Skeleton } from "@/components/ui/LoadingSkeleton";
import Link from "next/link";

export default function LayananLoading() {
  return (
    <div className="customer-shell">
      <div className="mx-auto w-full max-w-5xl" aria-busy="true" aria-live="polite">
        <div className="app-hero rounded-3xl p-6">
          <div className="animate-pulse rounded h-7 w-56 bg-white/20" />
          <div className="animate-pulse rounded mt-3 h-3.5 w-72 max-w-full bg-white/20" />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-app-border bg-app-surface p-3">
              <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
              <Skeleton className="mx-auto mt-2 h-3.5 w-16" />
            </div>
          ))}
        </div>
        <p className="mt-5 text-center text-xs font-semibold text-app-subtle">
          Memuat layanan. <Link href="/" className="text-app-kicker hover:underline">Kembali ke beranda</Link>
        </p>
      </div>
    </div>
  );
}
