import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/utils";

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const supabase = createClient();
  const { data: product } = await supabase.from("products").select("id, name, description, price, thumbnail_url, product_type, stock, is_active, categories(name)").eq("slug", params.slug).eq("is_active", true).single();
  if (!product) notFound();
  const category = (product as any).categories?.name || "Produk Digital";
  const isDigital = product.product_type === "digital";
  return (
    <div className="customer-shell"><div className="mx-auto w-full max-w-[480px] animate-page-in md:max-w-3xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-zinc-400 transition hover:text-gold-400">← Kembali ke toko</Link>
      <div className="mt-5 grid overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-900 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden bg-zinc-950">
          {product.thumbnail_url ? <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover transition duration-700 hover:scale-105" /> : <div className="flex h-full items-center justify-center text-7xl">🛍️</div>}
          <div className="absolute left-5 top-5 rounded-full bg-zinc-950/80 px-3 py-1.5 text-xs font-black text-gold-400 ring-1 ring-gold-400/40 backdrop-blur">{isDigital ? "PRODUK DIGITAL" : "JASA / PRODUK"}</div>
        </div>
        <div className="p-6 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-gold-400">{category}</p>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">{product.name}</h1>
          <p className="mt-4 text-2xl font-black tabular-nums text-gold-400">{formatRupiah(product.price)}</p>
          {product.stock !== null && <p className="mt-2 text-sm font-semibold text-zinc-400">Stok tersisa: <span className="tabular-nums text-white">{product.stock}</span></p>}
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm leading-6 text-zinc-300"><span className="font-bold text-white">Deskripsi</span><p className="mt-2 whitespace-pre-line">{product.description || "Tidak ada deskripsi untuk produk ini."}</p></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={`/checkout?product=${encodeURIComponent(product.id)}&qty=1`} className="flex min-h-[44px] items-center justify-center rounded-2xl bg-gold-400 px-5 py-3.5 text-center text-sm font-black text-zinc-950 shadow-lg shadow-gold-400/20 transition hover:-translate-y-0.5 hover:bg-gold-300 hover:shadow-xl">Beli Sekarang</Link>
            <Link href="/wallet/topup" className="flex min-h-[44px] items-center justify-center rounded-2xl border border-zinc-700 bg-transparent px-5 py-3.5 text-center text-sm font-black text-zinc-200 transition hover:border-gold-400/60 hover:text-gold-400">Top Up Saldo</Link>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
