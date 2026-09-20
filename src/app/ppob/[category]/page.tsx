import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PPOBServiceGrid from "@/components/PPOBServiceGrid";

const CONFIG: Record<string, { title: string; desc: string; icon: string }> = {
  pulsa: { title: "Pulsa Semua Operator", desc: "Pulsa prabayar dari operator yang tersedia di Digiflazz.", icon: "📱" },
  "paket-data": { title: "Paket Data", desc: "Paket internet dan kuota dari operator yang tersedia.", icon: "🌐" },
  "top-up-game": { title: "Games", desc: "Top up game berdasarkan SKU Digiflazz yang aktif.", icon: "🎮" },
  voucher: { title: "Voucher", desc: "Voucher digital yang tersedia dari provider.", icon: "🎟️" },
  pln: { title: "PLN", desc: "Token listrik dan layanan PLN prabayar yang tersedia.", icon: "⚡" },
  "china-topup": { title: "China TOPUP", desc: "Top up layanan China yang tersedia dari provider.", icon: "🇨🇳" },
  "malaysia-topup": { title: "Malaysia TOPUP", desc: "Top up layanan Malaysia yang tersedia dari provider.", icon: "🇲🇾" },
  "philippines-topup": { title: "Philippines TOPUP", desc: "Top up layanan Philippines yang tersedia dari provider.", icon: "🇵🇭" },
  "singapore-topup": { title: "Singapore TOPUP", desc: "Top up layanan Singapore yang tersedia dari provider.", icon: "🇸🇬" },
  "thailand-topup": { title: "Thailand TOPUP", desc: "Top up layanan Thailand yang tersedia dari provider.", icon: "🇹🇭" },
  "sms-telpon": { title: "Paket SMS & Telpon", desc: "Paket komunikasi prabayar yang tersedia.", icon: "☎️" },
  "vietnam-topup": { title: "Vietnam Topup", desc: "Top up layanan Vietnam yang tersedia dari provider.", icon: "🇻🇳" },
  streaming: { title: "Streaming", desc: "Voucher dan paket streaming yang tersedia.", icon: "▶️" },
  tv: { title: "TV", desc: "Produk TV dan voucher yang tersedia.", icon: "📺" },
  "aktivasi-voucher": { title: "Aktivasi Voucher", desc: "Produk aktivasi voucher dari provider.", icon: "🎫" },
  "masa-aktif": { title: "Masa Aktif", desc: "Produk perpanjangan masa aktif yang tersedia.", icon: "⏳" },
  bundling: { title: "Bundling", desc: "Produk bundling dari provider.", icon: "📦" },
  "aktivasi-perdana": { title: "Aktivasi Perdana", desc: "Produk aktivasi kartu perdana yang tersedia.", icon: "📲" },
  gas: { title: "Gas", desc: "Produk gas prabayar yang tersedia.", icon: "🔥" },
  "media-sosial": { title: "Media Sosial", desc: "Produk media sosial yang tersedia dari provider.", icon: "📣" },
  hotel: { title: "Hotel", desc: "Produk hotel/travel yang tersedia dari provider.", icon: "🏨" },
  "e-wallet": { title: "E-Wallet", desc: "Top up saldo dompet digital yang tersedia.", icon: "💳" },
  bpjs: { title: "BPJS", desc: "Layanan BPJS yang tersedia.", icon: "🏥" },
  internet: { title: "Internet", desc: "Layanan internet yang tersedia.", icon: "📡" },
  pdam: { title: "PDAM", desc: "Tagihan air yang tersedia.", icon: "💧" },
  "pascabayar": { title: "HP Pascabayar", desc: "Tagihan HP pascabayar yang tersedia.", icon: "☎️" },
  "tagihan-lainnya": { title: "Tagihan Lainnya", desc: "Layanan pascabayar tambahan dari provider.", icon: "🧾" },
  pbb: { title: "PBB", desc: "Layanan pajak bumi dan bangunan yang tersedia.", icon: "🏠" },
  "pln-pascabayar": { title: "PLN PASCABAYAR", desc: "Tagihan listrik pascabayar.", icon: "⚡" },
  "hp-pascabayar": { title: "HP PASCABAYAR", desc: "Tagihan operator seluler pascabayar.", icon: "📱" },
  "internet-pascabayar": { title: "INTERNET PASCABAYAR", desc: "Tagihan internet pascabayar.", icon: "🌐" },
  "bpjs-kesehatan": { title: "BPJS KESEHATAN", desc: "Tagihan BPJS Kesehatan.", icon: "🏥" },
  multifinance: { title: "MULTIFINANCE", desc: "Tagihan multifinance yang tersedia.", icon: "💰" },
  "gas-negara": { title: "GAS NEGARA", desc: "Tagihan gas negara yang tersedia.", icon: "🔥" },
  "tv-pascabayar": { title: "TV PASCABAYAR", desc: "Tagihan TV pascabayar.", icon: "📺" },
  samsat: { title: "SAMSAT", desc: "Layanan Samsat yang tersedia.", icon: "🚗" },
  "bpjs-ketenagakerjaan": { title: "BPJS KETENAGAKERJAAN", desc: "Layanan BPJS Ketenagakerjaan.", icon: "🧾" },
  "pln-nontaglis": { title: "PLN NONTAGLIS", desc: "Layanan PLN Nontaglis yang tersedia.", icon: "⚡" },
  "telkomsel-omni": { title: "Telkomsel Omni", desc: "Produk khusus Telkomsel yang tersedia dari provider.", icon: "🔴" },
  "indosat-only4u": { title: "Indosat Only4u", desc: "Produk khusus Indosat yang tersedia dari provider.", icon: "🟡" },
  "tri-cuanmax": { title: "Tri CuanMax", desc: "Produk khusus Tri yang tersedia dari provider.", icon: "🟣" },
  "xl-axis-cuanku": { title: "XL Axis Cuanku", desc: "Produk khusus XL/AXIS yang tersedia dari provider.", icon: "🔵" },
  byu: { title: "by.U", desc: "Produk by.U yang tersedia dari provider.", icon: "🟢" },
  "transfer-uang": { title: "Transfer Uang / Kirim Uang", desc: "Layanan transfer yang diaktifkan admin dan didukung provider payout.", icon: "🏦" },
};

export default async function PPOBCategoryPage({ params }: { params: { category: string } }) {
  const config = CONFIG[params.category];
  if (!config) notFound();
  const supabase = createClient();
  const { data } = await supabase
    .from("ppob_services")
    .select("id, product_id, provider_sku, service_kind, category, brand, products(id, name, slug, price, thumbnail_url)")
    .eq("category", params.category)
    .eq("provider_active", true)
    .order("brand", { ascending: true });

  const services = (data || []).map((row: any) => ({
    id: row.id, product_id: row.product_id, provider_sku: row.provider_sku, service_kind: row.service_kind,
    category: row.category, brand: row.brand, product: row.products,
  }));

  return (
    <div className="mx-auto max-w-6xl animate-page-in pb-20">
      <Link href="/#layanan" className="inline-flex rounded-xl px-2 py-2 text-sm font-bold text-slate-500 hover:bg-white hover:text-slate-900">← Semua layanan</Link>
      <section className="mt-3 overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300 text-3xl text-slate-950">{config.icon}</div>
          <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-amber-300">AIDIL STORE PPOB</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">{config.title}</h1><p className="mt-2 text-sm text-white/65">{config.desc}</p></div>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-xs font-bold text-white/70">
          <div className="rounded-xl bg-white/5 p-3">🔒 Aman</div><div className="rounded-xl bg-white/5 p-3">⚡ Otomatis</div><div className="rounded-xl bg-white/5 p-3">🧾 Ada riwayat</div>
        </div>
      </section>
      <div className="mb-4 mt-7 flex items-end justify-between gap-3"><div><p className="section-kicker">Pilihan layanan</p><h2 className="section-title">Pilih produk</h2></div><span className="text-xs text-slate-400">{services.length} SKU aktif</span></div>
      <PPOBServiceGrid services={services} category={params.category} />
    </div>
  );
}
