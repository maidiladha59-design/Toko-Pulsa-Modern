"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatRupiah, formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import ProductImage from "@/components/ProductImage";
import Icon from "@/components/icons/Icon";
import {
  transactionDayKey,
  transactionDayLabel,
  transactionStatusKind,
} from "@/lib/transaction-view";

export type TransactionEntry = {
  id: string;
  kind: "order" | "wallet";
  title: string;
  subtitle: string;
  target?: string | null;
  invoice?: string | null;
  amount: number;
  status: string;
  date: string;
  href: string;
  image?: string | null;
  icon?: string;
  refundAmount?: number | null;
  walletType?: string | null;
};

type Props = {
  entries: TransactionEntry[];
  balance: number;
  successCount: number;
  processingCount: number;
  hasTopup: boolean;
};

type TabValue = "ALL" | "SUCCESS" | "PROCESSING" | "FAILED" | "TOPUP";

const BASE_TABS: Array<{ value: TabValue; label: string }> = [
  { value: "ALL", label: "Semua" },
  { value: "SUCCESS", label: "Berhasil" },
  { value: "PROCESSING", label: "Diproses" },
  { value: "FAILED", label: "Gagal" },
];

const PAGE_SIZE = 20;

function amountClass(amount: number) {
  if (amount > 0) return "text-success-600 dark:text-success-400";
  if (amount < 0) return "text-danger-600 dark:text-danger-400";
  return "text-app-text";
}

function matchesTab(entry: TransactionEntry, tab: TabValue) {
  if (tab === "ALL") return true;
  if (tab === "TOPUP") return entry.walletType === "TOPUP";
  return transactionStatusKind(entry.status) === tab.toLowerCase();
}

function EntrySkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5" aria-hidden="true">
      <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-app-inset" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-3/5 animate-pulse rounded bg-app-inset" />
        <div className="h-3.5 w-2/5 animate-pulse rounded bg-app-inset/70" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-app-inset/70" />
      </div>
    </div>
  );
}

export default function TransactionCenter({
  entries,
  balance,
  successCount,
  processingCount,
  hasTopup,
}: Props) {
  const [tab, setTab] = useState<TabValue>("ALL");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const tabs = hasTopup ? [...BASE_TABS, { value: "TOPUP" as TabValue, label: "Top Up" }] : BASE_TABS;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tab, debouncedQuery]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!matchesTab(entry, tab)) return false;
      if (!q) return true;
      return [entry.title, entry.subtitle, entry.target, entry.invoice]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [debouncedQuery, entries, tab]);

  const hasMore = visibleCount < filtered.length;

  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: TransactionEntry[] }>();
    for (const entry of filtered.slice(0, visibleCount)) {
      const key = transactionDayKey(entry.date);
      const group = map.get(key) || { label: transactionDayLabel(entry.date), items: [] };
      group.items.push(entry);
      map.set(key, group);
    }
    return Array.from(map.values());
  }, [filtered, visibleCount]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    timerRef.current = window.setTimeout(() => {
      setVisibleCount((count) => count + PAGE_SIZE);
      setLoadingMore(false);
    }, 220);
  }, [hasMore, loadingMore]);

  useEffect(() => {
    if (!hasMore || loadingMore) return;
    const target = sentinelRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) loadMore();
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  const noResults = filtered.length === 0;
  const hasAnyEntry = entries.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Pusat Aktivitas</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-app-text sm:text-3xl">Transaksi</h1>
          <p className="mt-1 text-sm text-app-muted">Pantau pembelian, top up, dan perubahan saldo dalam satu tempat.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/"
            aria-label="Buat transaksi baru"
            className="btn-gold flex h-11 w-11 items-center justify-center rounded-2xl transition"
          >
            <Icon name="plus" size={20} />
          </Link>
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Tutup pencarian" : "Cari transaksi"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-surface text-app-text transition hover:border-gold-400/60 hover:text-app-kicker focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold-400/20"
          >
            <Icon name={searchOpen ? "close" : "search"} size={20} />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-subtle">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari produk, nomor tujuan, atau invoice..."
            className="w-full rounded-2xl border border-app-border bg-app-surface py-3 pl-10 pr-4 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <div className="min-w-0 rounded-2xl border border-app-border bg-app-surface p-3">
          <p className="text-[11px] font-bold text-app-muted">Saldo</p>
          <p className="mt-1 break-words text-base font-black tabular-nums text-app-kicker">{formatRupiah(balance)}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-app-border bg-app-surface p-3">
          <p className="text-[11px] font-bold text-app-muted">Berhasil</p>
          <p className="mt-1 text-base font-black tabular-nums text-success-600 dark:text-success-400">{successCount}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-app-border bg-app-surface p-3">
          <p className="text-[11px] font-bold text-app-muted">Diproses</p>
          <p className="mt-1 text-base font-black tabular-nums text-app-text">{processingCount}</p>
        </div>
      </div>

      <div>
        <div
          role="tablist"
          aria-label="Filter transaksi"
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => setTab(item.value)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black transition ${
                tab === item.value
                  ? "bg-gold-400 text-zinc-950"
                  : "bg-app-inset text-app-muted hover:bg-app-accent-soft hover:text-app-kicker"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="px-1 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-app-subtle">{group.label}</h2>
              <div className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
                <div className="divide-y divide-app-border">
                  {group.items.map((entry) => {
                    const amount = Number(entry.amount) || 0;
                    return (
                      <Link
                        key={`${entry.kind}-${entry.id}`}
                        href={entry.href}
                        className="flex items-start gap-3 px-4 py-3.5 transition hover:bg-app-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-400/40"
                      >
                        <ProductImage
                          src={entry.image}
                          alt={entry.title}
                          className="h-12 w-12 shrink-0 rounded-xl border border-app-border"
                          iconSize={22}
                          fallbackIcon={entry.icon || (entry.kind === "wallet" ? "wallet" : "bag")}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2.5">
                            <p className="min-w-0 flex-1 break-words text-base font-semibold leading-5 text-app-text">{entry.title}</p>
                            <StatusBadge status={entry.status} />
                          </div>
                          {entry.subtitle && (
                            <p className="mt-1 break-words text-sm leading-5 text-app-muted">{entry.subtitle}</p>
                          )}
                          <div className="mt-1.5 flex items-end justify-between gap-3">
                            <p className="text-xs leading-4 text-app-subtle">{formatDate(entry.date)}</p>
                            <p className={`shrink-0 text-sm font-black tabular-nums ${amountClass(amount)}`}>
                              {amount > 0 ? "+" : amount < 0 ? "−" : ""}
                              {formatRupiah(Math.abs(amount))}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          ))}

          {loadingMore && (
            <div className="rounded-2xl border border-app-border bg-app-surface" aria-busy="true">
              <EntrySkeleton />
              <div className="border-t border-app-border"><EntrySkeleton /></div>
            </div>
          )}

          {hasMore && !loadingMore && (
            <button
              type="button"
              onClick={loadMore}
              className="w-full rounded-2xl border border-app-border bg-app-surface px-4 py-3 text-sm font-black text-app-kicker transition hover:border-gold-400/60"
            >
              Muat lebih banyak
            </button>
          )}

          <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />

          {noResults && (
            <div className="rounded-2xl border border-dashed border-app-border bg-app-surface px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-app-inset">
                <Icon name={hasAnyEntry ? "search" : "receipt"} size={24} />
              </div>
              <p className="mt-3 font-black text-app-text">
                {hasAnyEntry ? "Transaksi tidak ditemukan" : "Belum ada transaksi"}
              </p>
              <p className="mt-1 text-sm text-app-muted">
                {hasAnyEntry ? "Coba ubah kata kunci atau filter." : "Transaksi yang Anda buat akan muncul di sini."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
