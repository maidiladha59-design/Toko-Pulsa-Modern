"use client";

import Link from "next/link";

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

export default function PPOBServiceGrid({ services, category }: { services: Service[]; category: string }) {
  if (!services.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-3xl">📡</div>
        <h2 className="mt-4 text-lg font-black text-slate-900">Layanan belum tersedia</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Produk untuk layanan ini belum tersedia saat ini. Silakan cek kembali nanti.</p>
        <Link href="/" className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Kembali ke Beranda</Link>
      </div>
    );
  }

  const fallbackIcon = CATEGORY_ICON[category] || "📦";
  const grouped = groupByBrand(services);

  return (
    <div className="space-y-8">
      {grouped.map(([brand, items]) => (
        <section key={brand}>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-lg text-white">
              {brandIcon(brand)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-black text-slate-900">{brand}</h3>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{items.length} produk tersedia</p>
            </div>
            <span className="ml-auto hidden shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-black uppercase text-slate-500 sm:inline-flex">{brand}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((service) => {
              const p = service.product;
              if (!p) return null;
              return (
                <Link key={service.id} href={`/checkout?product=${encodeURIComponent(p.id)}&qty=1`} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg">
                  <div className="aspect-square overflow-hidden bg-slate-100">
                    {p.thumbnail_url ? <img src={p.thumbnail_url} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-5xl">{fallbackIcon}</div>}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-black text-slate-900">{p.name}</p>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase text-emerald-700">{service.service_kind === "postpaid" ? "Pascabayar" : "Prabayar"}</span>
                    </div>
                    <p className="mt-2 text-sm font-black text-amber-700">Mulai transaksi →</p>
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