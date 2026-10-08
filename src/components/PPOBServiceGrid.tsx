"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { NetworkEmpty } from "@/components/NetworkState";

type Service = {
  id: string;
  product_id: string;
  provider_sku: string;
  service_kind: "prepaid" | "postpaid";
  category: string;
  brand: string | null;
  product: { id: string; name: string; slug: string; price: number; thumbnail_url: string | null } | null;
};

const CATEGORY_ICON: Record<string, string> = {
  "top-up-game": "🎮",
  "e-wallet": "💳",
  pln: "⚡",
  pulsa: "📱",
};

function brandIcon(brand: string) {
  const b = brand.toLowerCase();
  if (b.includes("telkomsel")) return "🔴";
  if (b.includes("indosat") || b.includes("im3")) return "🟡";
  if (b.includes("tri") || b === "3") return "🟣";
  if (b.includes("xl") || b.includes("axis")) return "🔵";
  if (b.includes("smartfren")) return "⚫";
  if (b.includes("by.u") || b.includes("byu")) return "🟢";
  if (b.includes("free fire")) return "🔥";
  if (b.includes("mobile legend") || b === "ml") return "⚔️";
  if (b.includes("genshin")) return "✨";
  if (b.includes("pubg")) return "🎯";
  return "📦";
}

function groupByBrand(services: Service[]) {
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    const key = (service.brand || "Lainnya").trim() || "Lainnya";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(service);
  }
  return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], "id"));
}

/** Ambil angka pertama dari nama produk untuk sortir nominal/kuota, mis. "Telkomsel 5GB 30 Hari" -> 5 */
function firstNumber(name: string): number {
  const match = name.replace(/[.,](?=\d{3}\b)/g, "").match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return Number.POSITIVE_INFINITY;
  return parseFloat(match[1].replace(",", "."));
}

type SortMode = "default" | "price-asc" | "price-desc" | "size-asc" | "size-desc";

export default function PPOBServiceGrid({ services, category }: { services: Service[]; category: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("default");
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});

  // brand_key = brand dalam huruf kecil; RLS brand_media mengizinkan semua orang SELECT.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await createClient().from("brand_media").select("brand_key,logo_url");
        if (!mounted || !data) return;
        const map: Record<string, string> = {};
        for (const row of data) if (row.logo_url) map[row.brand_key] = row.logo_url;
        setLogoMap(map);
      } catch {
        /* fallback emoji tetap dipakai */
      }
    })();
    return () => { mounted = false; };
  }, []);

  const showSizeSort = category === "paket-data" || category === "top-up-game" || category === "sms-telpon";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = services.filter((s) => (q ? (s.product?.name || "").toLowerCase().includes(q) || (s.brand || "").toLowerCase().includes(q) : true));
    if (sort === "price-asc") list = [...list].sort((a, b) => (a.product?.price ?? 0) - (b.product?.price ?? 0));
    else if (sort === "price-desc") list = [...list].sort((a, b) => (b.product?.price ?? 0) - (a.product?.price ?? 0));
    else if (sort === "size-asc") list = [...list].sort((a, b) => firstNumber(a.product?.name || "") - firstNumber(b.product?.name || ""));
    else if (sort === "size-desc") list = [...list].sort((a, b) => firstNumber(b.product?.name || "") - firstNumber(a.product?.name || ""));
    return list;
  }, [services, query, sort]);

  if (!services.length) {
    return (
      <div className="rounded-3xl border border-app-border bg-app-surface p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-app-accent-soft text-3xl">📡</div>
        <h2 className="mt-4 text-lg font-black text-app-text">Layanan belum tersedia</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">Admin perlu melakukan sinkronisasi SKU PPOB dan mengaktifkan produk terlebih dahulu.</p>
        <Link href="/" className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-gold-300">Kembali ke Beranda</Link>
      </div>
    );
  }

  const fallbackIcon = CATEGORY_ICON[category] || "📦";
  const grouped = groupByBrand(filtered);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 rounded-2xl border border-app-border bg-app-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-app-subtle">🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk..."
            className="w-full rounded-xl border border-app-border bg-app-inset py-2.5 pl-9 pr-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          className="rounded-xl border border-app-border bg-app-inset px-3 py-2.5 text-sm font-bold text-app-text outline-none transition focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
        >
          <option value="default">Urutkan: Default</option>
          <option value="price-asc">Harga: Termurah</option>
          <option value="price-desc">Harga: Termahal</option>
          {showSizeSort && <option value="size-asc">Kuota/Nominal: Kecil ke Besar</option>}
          {showSizeSort && <option value="size-desc">Kuota/Nominal: Besar ke Kecil</option>}
        </select>
      </div>

      {grouped.length === 0 && (
        <NetworkEmpty title="Tidak ada produk yang cocok" description="Coba kata kunci lain atau ubah urutan." />
      )}

      {grouped.map(([brand, items]) => (
        <section key={brand} className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
          <div className="flex items-center gap-3 border-b border-app-border bg-app-inset px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gold-400 text-base text-zinc-950">
              {logoMap[brand.trim().toLowerCase()] ? (
                <Image src={logoMap[brand.trim().toLowerCase()]} alt={`Logo ${brand}`} width={36} height={36} className="h-full w-full object-cover" />
              ) : (
                brandIcon(brand)
              )}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-app-text">{brand}</h3>
              <p className="text-[10px] font-bold uppercase tracking-wide text-app-kicker/80">{items.length} produk tersedia</p>
            </div>
          </div>

          <div className="divide-y divide-app-border">
            {items.map((service) => {
              const p = service.product;
              if (!p) return null;
              return (
                <Link
                  key={service.id}
                  href={`/checkout?product=${encodeURIComponent(p.id)}&qty=1`}
                  className="group flex items-center gap-3 px-4 py-3.5 transition hover:bg-app-inset active:bg-app-accent-soft"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-app-inset text-lg">
                    {p.thumbnail_url ? (
                      <Image src={p.thumbnail_url} alt={p.name} width={44} height={44} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-app-kicker">{fallbackIcon}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-app-text">{p.name}</p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-app-subtle">
                      {service.service_kind === "postpaid" ? "Pascabayar" : "Prabayar"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-black tabular-nums text-app-kicker">
                      {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(p.price)}
                    </span>
                    <span className="text-app-kicker transition group-hover:translate-x-0.5">›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
