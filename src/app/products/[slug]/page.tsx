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
    <div className="mx-auto max-w-6xl animate-page-in">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-gold-600">← Kembali ke toko</Link>
      <div className="mt-5 grid overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl shadow-slate-900/5 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-gold-50 via-white to-gold-100">
          {product.thumbnail_url ? <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover transition duration-700 hover:scale-105" /> : <div className="flex h-full items-center justify-center text-7xl">🛍️</div>}
          <div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-black text-gold-700 shadow-sm backdrop-blur">{isDigital ? "PRODUK DIGITAL" : "JASA / PRODUK"}</div>
        </div>
        <div className="p-7 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">{category}</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{product.name}</h1>
          <p className="mt-4 text-2xl font-black text-gold-600">{formatRupiah(product.price)}</p>
          {product.stock !== null && <p className="mt-2 text-sm font-semibold text-slate-500">Stok tersisa: {product.stock}</p>}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-6 text-slate-600"><span className="font-bold text-slate-800">Deskripsi</span><p className="mt-2 whitespace-pre-line">{product.description || "Tidak ada deskripsi untuk produk ini."}</p></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href={`/checkout?product=${encodeURIComponent(product.id)}&qty=1`} className="rounded-2xl bg-gradient-to-r from-gold-600 to-gold-600 px-5 py-3.5 text-center text-sm font-black text-white shadow-lg shadow-gold-600/20 transition hover:-translate-y-0.5 hover:shadow-xl">Beli Sekarang</Link>
            <Link href="/wallet/topup" className="rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-center text-sm font-black text-slate-700 transition hover:border-gold-200 hover:bg-gold-50 hover:text-gold-700">Top Up Saldo</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
