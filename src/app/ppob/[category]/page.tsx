import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PPOBServiceGrid from "@/components/PPOBServiceGrid";
import ServiceTrustBadges from "@/components/ui/ServiceTrustBadges";
import Icon from "@/components/icons/Icon";

const CONFIG: Record<string, { title: string; desc: string; icon: string }> = {
  pulsa: { title: "Pulsa Semua Operator", desc: "Isi pulsa semua operator dengan cepat dan otomatis.", icon: "pulsa" },
  "paket-data": { title: "Paket Data", desc: "Paket internet dan kuota dari operator yang tersedia.", icon: "data" },
  "top-up-game": { title: "Games", desc: "Top Up diamond, UC, dan voucher game favorit Anda.", icon: "game" },
  voucher: { title: "Voucher", desc: "Voucher digital yang tersedia.", icon: "voucher" },
  pln: { title: "PLN", desc: "Token listrik dan layanan PLN prabayar yang tersedia.", icon: "bolt" },
  "china-topup": { title: "Top Up China", desc: "Top Up layanan China yang tersedia.", icon: "money_send" },
  "malaysia-topup": { title: "Top Up Malaysia", desc: "Top Up layanan Malaysia yang tersedia.", icon: "money_send" },
  "philippines-topup": { title: "Top Up Philippines", desc: "Top Up layanan Philippines yang tersedia.", icon: "money_send" },
  "singapore-topup": { title: "Top Up Singapore", desc: "Top Up layanan Singapore yang tersedia.", icon: "money_send" },
  "thailand-topup": { title: "Top Up Thailand", desc: "Top Up layanan Thailand yang tersedia.", icon: "money_send" },
  "sms-telpon": { title: "Paket SMS & Telpon", desc: "Paket komunikasi prabayar yang tersedia.", icon: "phone" },
  "vietnam-topup": { title: "Top Up Vietnam", desc: "Top Up layanan Vietnam yang tersedia.", icon: "money_send" },
  streaming: { title: "Streaming", desc: "Voucher dan paket streaming yang tersedia.", icon: "streaming" },
  tv: { title: "TV", desc: "Produk TV dan voucher yang tersedia.", icon: "tv" },
  "aktivasi-voucher": { title: "Aktivasi Voucher", desc: "Produk aktivasi voucher yang tersedia.", icon: "ticket" },
  "masa-aktif": { title: "Masa Aktif", desc: "Produk perpanjangan masa aktif yang tersedia.", icon: "hourglass" },
  bundling: { title: "Bundling", desc: "Produk bundling yang tersedia.", icon: "box" },
  "aktivasi-perdana": { title: "Aktivasi Perdana", desc: "Produk aktivasi kartu perdana yang tersedia.", icon: "sim_card" },
  gas: { title: "Gas", desc: "Produk gas prabayar yang tersedia.", icon: "gas" },
  "media-sosial": { title: "Media Sosial", desc: "Produk media sosial yang tersedia.", icon: "megaphone" },
  hotel: { title: "Hotel", desc: "Produk hotel/travel yang tersedia.", icon: "hotel" },
  "e-wallet": { title: "E-Wallet", desc: "Top Up saldo dompet digital yang tersedia.", icon: "card" },
  bpjs: { title: "BPJS", desc: "Layanan BPJS yang tersedia.", icon: "hospital" },
  internet: { title: "Internet", desc: "Layanan internet yang tersedia.", icon: "signal" },
  pdam: { title: "PDAM", desc: "Tagihan air yang tersedia.", icon: "water" },
  "pascabayar": { title: "HP Pascabayar", desc: "Tagihan HP pascabayar yang tersedia.", icon: "phone" },
  "tagihan-lainnya": { title: "Tagihan Lainnya", desc: "Layanan pascabayar tambahan yang tersedia.", icon: "receipt" },
  pbb: { title: "PBB", desc: "Layanan pajak bumi dan bangunan yang tersedia.", icon: "building" },
  "pln-pascabayar": { title: "PLN Pascabayar", desc: "Tagihan listrik pascabayar.", icon: "bolt" },
  "hp-pascabayar": { title: "HP Pascabayar", desc: "Tagihan operator seluler pascabayar.", icon: "pulsa" },
  "internet-pascabayar": { title: "Internet Pascabayar", desc: "Tagihan internet pascabayar.", icon: "data" },
  "bpjs-kesehatan": { title: "BPJS Kesehatan", desc: "Tagihan BPJS Kesehatan.", icon: "hospital" },
  multifinance: { title: "Multifinance", desc: "Tagihan multifinance yang tersedia.", icon: "wallet" },
  "gas-negara": { title: "Gas Negara", desc: "Tagihan gas negara yang tersedia.", icon: "gas" },
  "tv-pascabayar": { title: "TV Pascabayar", desc: "Tagihan TV pascabayar.", icon: "tv" },
  samsat: { title: "SAMSAT", desc: "Layanan Samsat yang tersedia.", icon: "car" },
  "bpjs-ketenagakerjaan": { title: "BPJS Ketenagakerjaan", desc: "Layanan BPJS Ketenagakerjaan.", icon: "receipt" },
  "pln-nontaglis": { title: "PLN Nontaglis", desc: "Layanan PLN Nontaglis yang tersedia.", icon: "bolt" },
  "telkomsel-omni": { title: "Telkomsel Omni", desc: "Produk khusus Telkomsel yang tersedia.", icon: "dot" },
  "indosat-only4u": { title: "Indosat Only4u", desc: "Produk khusus Indosat yang tersedia.", icon: "dot" },
  "tri-cuanmax": { title: "Tri CuanMax", desc: "Produk khusus Tri yang tersedia.", icon: "dot" },
  "xl-axis-cuanku": { title: "XL Axis Cuanku", desc: "Produk khusus XL/AXIS yang tersedia.", icon: "dot" },
  byu: { title: "by.U", desc: "Produk by.U yang tersedia.", icon: "dot" },
  "transfer-uang": { title: "Transfer Uang / Kirim Uang", desc: "Layanan transfer yang diaktifkan admin dan didukung sistem pembayaran.", icon: "bank" },
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
    <div className="customer-shell"><div className="mx-auto w-full max-w-3xl animate-page-in">
      <Link href="/#layanan" className="inline-flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm font-bold text-app-muted transition hover:bg-app-inset hover:text-app-text"><Icon name="chevron_left" size={16} />Semua layanan</Link>
      <section className="app-hero mt-3 overflow-hidden rounded-[2rem] p-6 text-white sm:p-8">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gold-400 text-zinc-950"><Icon name={config.icon} size={30} /></div>
          <div><h1 className="text-2xl font-black sm:text-3xl">{config.title}</h1><p className="mt-2 text-sm text-zinc-400">{config.desc}</p></div>
        </div>
        <ServiceTrustBadges />
      </section>
      <div className="mb-3 mt-5 flex items-end justify-between gap-3"><h2 className="text-xl font-black text-app-text">Pilih produk</h2><span className="text-xs font-bold text-app-subtle">{services.length} produk tersedia</span></div>
      <PPOBServiceGrid services={services} category={params.category} />
    </div>
    </div>
  );
}
