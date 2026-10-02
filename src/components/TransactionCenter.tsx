"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatDate, formatRupiah } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

type Entry = {
  id: string; kind: "order" | "wallet"; title: string; subtitle: string;
  amount: number; status: string; date: string; href?: string; target?: string;
};

const tabs = [
  ["ALL", "Semua"], ["PPOB", "Digital"], ["ORDER", "Pesanan"], ["WALLET", "Wallet"], ["PROCESSING", "Diproses"], ["SUCCESS", "Berhasil"], ["FAILED", "Gagal"],
] as const;

export default function TransactionCenter({ entries }: { entries: Entry[] }) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("ALL");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      const matchesTab = tab === "ALL" || (tab === "PPOB" && e.kind === "order" && !!e.target) || (tab === "ORDER" && e.kind === "order" && !e.target) || (tab === "WALLET" && e.kind === "wallet") || (tab === e.status);
      const matchesQuery = !q || [e.title, e.subtitle, e.target, e.status].filter(Boolean).join(" ").toLowerCase().includes(q);
      return matchesTab && matchesQuery;
    });
  }, [entries, query, tab]);

  return <div className="space-y-4">
    <div className="rounded-2xl border border-app-border bg-app-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-app-subtle">⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari nomor order, produk, atau nomor tujuan..." className="w-full rounded-xl border border-app-border bg-app-inset py-3 pl-9 pr-4 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" /></div>
        <Link href="/" className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gold-400 px-4 py-3 text-center text-sm font-black text-zinc-950 transition hover:bg-gold-300">+ Transaksi Baru</Link>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-black transition ${tab === value ? "bg-gold-400 text-zinc-950" : "bg-app-inset text-app-muted hover:bg-app-accent-soft hover:text-app-kicker"}`}>{label}</button>)}</div>
    </div>

    <div className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
      {filtered.length ? <div className="divide-y divide-app-border">{filtered.map(e => <Link key={`${e.kind}-${e.id}`} href={e.href || "/transactions"} className="group flex gap-3 p-4 transition hover:bg-app-inset sm:items-center">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${e.kind === "wallet" ? "bg-gold-400/10" : e.target ? "bg-emerald-500/10" : "bg-gold-400/10"}`}>{e.kind === "wallet" ? "💰" : e.target ? "⚡" : "📦"}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-black text-app-text group-hover:text-app-kicker">{e.title}</p>{e.target && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400">Digital</span>}</div><p className="mt-1 truncate text-xs text-app-muted">{e.subtitle}{e.target ? ` · ${e.target}` : ""}</p><p className="mt-1 text-[11px] text-app-subtle">{formatDate(e.date)}</p></div>
        <div className="ml-auto flex shrink-0 flex-col items-end gap-1"><p className={`font-black tabular-nums ${e.amount < 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>{e.amount < 0 ? "−" : "+"}{formatRupiah(Math.abs(e.amount))}</p>{e.kind === "order" && <StatusBadge status={e.status} />}</div>
      </Link>)}</div> : <div className="p-10 text-center"><div className="text-4xl">🔎</div><p className="mt-3 font-black text-app-text">Transaksi tidak ditemukan</p><p className="mt-1 text-sm text-app-muted">Coba ubah kata kunci atau filter.</p></div>}
    </div>
  </div>;
}
