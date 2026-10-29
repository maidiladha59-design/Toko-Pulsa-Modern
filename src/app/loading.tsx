"use client";

import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/LoadingSkeleton";

// loading.tsx di root berlaku untuk semua rute yang belum punya loading.tsx
// sendiri, jadi isinya dibedakan: beranda memakai kerangka hero + grid layanan,
// rute lain memakai kerangka halaman umum supaya tidak terlihat seperti beranda.
export default function RootLoading() {
  const pathname = usePathname();
  return (
    <div className="customer-shell" aria-busy="true" aria-live="polite">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {pathname === "/" ? <HomeSkeleton /> : <PageSkeleton />}
      </div>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <>
      <section className="app-hero rounded-[2rem] p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-white/15" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-white/20" />
            <div className="h-4 w-40 animate-pulse rounded bg-white/20" />
          </div>
        </div>
        <div className="mt-5 h-8 w-3/4 animate-pulse rounded bg-white/20" />
        <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-white/20" />
        <div className="mt-5 grid grid-cols-4 gap-2 border-t border-white/10 pt-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-white/10" />
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="h-36 w-full rounded-[1.75rem]" />
      </section>

      <section className="rounded-2xl border border-app-border bg-app-surface p-4">
        <Skeleton className="h-5 w-24" />
        <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-2 py-1">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <Skeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-app-border bg-app-surface p-4">
        <Skeleton className="h-5 w-32" />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-app-border">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function PageSkeleton() {
  return (
    <>
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-48" />
      </div>
      <Skeleton className="h-32 w-full rounded-[1.75rem]" />
      <div className="overflow-hidden rounded-3xl border border-app-border bg-app-surface">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-app-border/60 px-4 py-3.5 last:border-0">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </>
  );
}
