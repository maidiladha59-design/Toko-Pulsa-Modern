"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import { formatRupiah } from "@/lib/utils";

type Product = { id: string; name: string; price: number; thumbnail_url: string | null; product_type?: string };
type PPOBService = { id: string; provider: string; provider_sku: string; service_kind: "prepaid" | "postpaid"; category: string; brand: string | null; target_schema: { fields?: Array<{ name: string; label: string; type?: string; required?: boolean; placeholder?: string }> } | null };
const MAX_TARGET_FILE_SIZE = 100 * 1024 * 1024;

function CheckoutForm() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const productId = searchParams.get("product");
  const parsedQty = Number(searchParams.get("qty") ?? "1");
  const qty = Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 0;

  const [product, setProduct] = useState<Product | null>(null);
  const [ppob, setPpob] = useState<PPOBService | null>(null);
  const [ppobTargets, setPpobTargets] = useState<Record<string, string>>({});
  const [inquiry, setInquiry] = useState<any>(null);
  const [inquiryId, setInquiryId] = useState<string | null>(null);
  const [inquiring, setInquiring] = useState(false);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [targetText, setTargetText] = useState("");
  const [targetFile, setTargetFile] = useState<File | null>(null);

  const idempotencyKey = useMemo(
    () => `${productId}-${qty}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [productId, qty]
  );
  const isJasa = product?.product_type === "jasa";

  useEffect(() => {
    async function load() {
      if (!productId || qty < 1) { setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const target = `/checkout?product=${encodeURIComponent(productId)}&qty=${encodeURIComponent(String(qty))}`;
        router.push(`/login?redirectTo=${encodeURIComponent(target)}`);
        return;
      }
      const [{ data: p }, { data: wallet }, { data: ppobService }] = await Promise.all([
        supabase.from("products").select("id, name, price, thumbnail_url, product_type").eq("id", productId).single(),
        supabase.from("wallets").select("balance").eq("user_id", user.id).single(),
        supabase.from("ppob_services").select("id, provider, provider_sku, service_kind, category, brand, target_schema").eq("product_id", productId).eq("provider_active", true).maybeSingle(),
      ]);
      setProduct(p as Product);
      setPpob((ppobService as PPOBService | null) || null);
      if (ppobService?.target_schema?.fields) {
        const initial: Record<string, string> = {};
        for (const field of ppobService.target_schema.fields) initial[field.name] = "";
        setPpobTargets(initial);
      }
      setBalance(Number(wallet?.balance || 0));
      setLoading(false);
    }
    load();
  }, [productId, qty, supabase, router]);

  function chooseTargetFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_TARGET_FILE_SIZE) {
      toast.show("Ukuran file maksimal 100 MB.", "error");
      return;
    }
    setTargetFile(file);
  }

  function validatePpobInput() {
    if (!ppob) return true;
    const fields = ppob.target_schema?.fields || [{ name: "customer_no", label: "Nomor Tujuan", required: true }];
    for (const field of fields) {
      if (field.required !== false && !String(ppobTargets[field.name] || "").trim()) {
        toast.show(`${field.label} wajib diisi.`, "error");
        return false;
      }
    }
    if (ppob.service_kind === "postpaid" && !inquiryId) {
      toast.show("Cek tagihan terlebih dahulu sebelum pembayaran.", "error");
      return false;
    }
    return true;
  }

  async function runInquiry() {
    if (!ppob || ppob.service_kind !== "postpaid") return;
    const customerNo = String(ppobTargets.customer_no || "").trim();
    if (!customerNo) { toast.show("Nomor pelanggan wajib diisi.", "error"); return; }
    setInquiring(true);
    try {
      const res = await fetch("/api/ppob/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_id: ppob.id, customer_no: customerNo }) });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Inquiry gagal.", "error"); return; }
      setInquiryId(json.inquiry_id);
      setInquiry({ ...(json.data || {}), ...(json.breakdown || {}), quote_amount: json.amount, expires_at: json.expires_at });
    } catch { toast.show("Inquiry gagal karena koneksi.", "error"); } finally { setInquiring(false); }
  }

  function validateJasaInput() {
    if (isJasa && !targetText.trim() && !targetFile) {
      toast.show("Isi target/link pesanan atau upload file sebelum membayar.", "error");
      return false;
    }
    return true;
  }

  async function saveSubmission(orderId: string, userId: string) {
    if (!isJasa) return;
    try {
      const { data: item } = await supabase.from("order_items").select("id").eq("order_id", orderId).limit(1).maybeSingle();
      if (!item) return;
      let targetFilePath: string | null = null;
      if (targetFile) {
        const ext = targetFile.name.split(".").pop()?.toLowerCase() || "bin";
        const path = `${userId}/${orderId}/${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("order-submissions").upload(path, targetFile, {
          cacheControl: "3600", upsert: false, contentType: targetFile.type,
        });
        if (!error) targetFilePath = path;
      }
      const { error } = await supabase.from("order_submissions").insert({
        order_id: orderId, order_item_id: item.id,
        target_text: targetText.trim() || null, target_file_path: targetFilePath,
      });
      if (error) toast.show("Pembayaran dibuat, tetapi data target jasa belum tersimpan. Cek halaman bantuan.", "error");
    } catch {
      toast.show("Pembayaran dibuat, tetapi data target jasa belum tersimpan.", "error");
    }
  }

  async function payWallet() {
    if (!product || confirming || !validateJasaInput() || !validatePpobInput()) return;
    const total = ppob?.service_kind === "postpaid" ? Number(inquiry?.selling_price || inquiry?.quote_amount || 0) : product.price * qty;
    if (balance < total) {
      toast.show("Saldo tidak mencukupi. Pilih QRIS/Bank atau Top Up saldo.", "error");
      return;
    }
    setConfirming(true);
    try {
      if (ppob?.service_kind === "postpaid" && inquiryId) {
        const res = await fetch("/api/ppob/postpaid/pay", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inquiry_id: inquiryId, idempotency_key: idempotencyKey, method: "WALLET" }),
        });
        const json = await res.json();
        if (!res.ok) { toast.show(json.message || "Pembayaran tagihan gagal.", "error"); return; }
        toast.show("Tagihan dibayar dan sedang diproses otomatis.", "success");
        router.push(`/orders/${json.order_id}`);
        return;
      }
      const endpoint = ppob?.service_kind === "prepaid" ? "/api/ppob/prepaid/pay" : "/api/checkout";
      const body = ppob?.service_kind === "prepaid"
        ? { product_id: product.id, customer_no: ppobTargets.customer_no || "", target_data: ppobTargets, idempotency_key: idempotencyKey }
        : { items: [{ product_id: product.id, quantity: qty }], idempotency_key: idempotencyKey, targets: ppob ? { [product.id]: { customer_no: ppobTargets.customer_no || "", target_data: ppobTargets } } : undefined };
      const res = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Checkout gagal.", "error"); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await saveSubmission(json.order_id, user.id);
      toast.show("Pembayaran saldo berhasil. Produk siap diambil.", "success");
      router.push(`/orders/${json.order_id}`);
    } catch {
      toast.show("Koneksi bermasalah. Silakan coba lagi.", "error");
    } finally {
      setConfirming(false);
    }
  }

  if (!productId || qty < 1) return <p className="text-sm text-slate-500">Parameter produk atau jumlah tidak valid.</p>;
  if (loading) return <div className="mx-auto max-w-lg animate-pulse rounded-[2rem] bg-white p-8 shadow-sm">Memuat checkout...</div>;
  if (!product) return <p className="text-sm text-slate-500">Produk tidak ditemukan.</p>;

  const subtotal = ppob?.service_kind === "postpaid" && inquiry ? Number(inquiry.quote_amount || inquiry.selling_price || 0) : product.price * qty;
  const enoughBalance = balance >= subtotal;

  return (
    <div className="mx-auto max-w-6xl animate-page-in">
      <div className="mb-7 flex items-center gap-3">
        <img src="/aidil-logo.png" alt="Aidil Store" className="h-14 w-14 rounded-2xl object-cover shadow-xl" />
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-amber-600">AIDIL STORE</p><h1 className="text-2xl font-black sm:text-3xl">Checkout Aman & Otomatis</h1><p className="text-sm text-slate-500">Bayar tanpa approve manual, lalu akses produk digital dari pesanan.</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                {product.thumbnail_url ? <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">🛍️</div>}
              </div>
              <div className="min-w-0">
                <p className="font-black text-slate-900">{product.name}</p>
                <p className="mt-1 text-sm text-slate-500">Jumlah: {qty}</p>
                <p className="mt-3 text-lg font-black text-gold-600">{formatRupiah(product.price)} / item</p>
              </div>
            </div>
          </div>

          {isJasa && (
            <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 sm:p-6">
              <p className="font-black text-amber-900">Target pesanan jasa</p>
              <p className="mt-1 text-xs leading-5 text-amber-800">Masukkan link/catatan atau file yang dibutuhkan agar pesanan dapat diproses.</p>
              <textarea value={targetText} onChange={(e) => setTargetText(e.target.value)} rows={4} placeholder="Link, username, catatan, atau detail pesanan..." className="mt-3 w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm outline-none focus:ring-4 focus:ring-amber-100" />
              <input type="file" onChange={(e) => chooseTargetFile(e.target.files?.[0])} className="mt-3 block w-full text-sm" />
              {targetFile && <p className="mt-2 text-xs font-bold text-emerald-700">✓ {targetFile.name}</p>}
            </div>
          )}

          {ppob && (
            <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-black text-emerald-950">Data tujuan PPOB</p><p className="mt-1 text-xs leading-5 text-emerald-800">Masukkan data pelanggan sebelum membuat pembayaran.</p></div>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase text-emerald-700">{ppob.service_kind === "postpaid" ? "Pascabayar" : "Prabayar"}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(ppob.target_schema?.fields || [{ name: "customer_no", label: "Nomor Tujuan", type: "text", required: true }]).map((field) => (
                  <label key={field.name} className={field.name === "customer_no" ? "sm:col-span-2" : ""}>
                    <span className="text-xs font-black text-emerald-950">{field.label}{field.required !== false ? " *" : ""}</span>
                    <input value={ppobTargets[field.name] || ""} onChange={(e) => setPpobTargets((v) => ({ ...v, [field.name]: e.target.value }))} placeholder={field.placeholder || `Masukkan ${field.label.toLowerCase()}`} inputMode={field.type === "number" ? "numeric" : "text"} className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100" />
                  </label>
                ))}
              </div>
              {ppob.service_kind === "postpaid" && (
                <div className="mt-4 rounded-2xl bg-white p-4">
                  <button type="button" onClick={runInquiry} disabled={inquiring} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60">{inquiring ? "Mengecek..." : "Cek Tagihan"}</button>
                  {inquiry && (
                    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-xs font-bold text-emerald-700">Pelanggan</p><p className="font-black text-emerald-950">{inquiry.customer_name || inquiry.customer_no || ppobTargets.customer_no}</p></div>
                        <div className="text-right"><p className="text-xs font-bold text-emerald-700">Total tagihan</p><p className="text-xl font-black text-emerald-950">{formatRupiah(Number(inquiry.quote_amount || inquiry.selling_price || 0))}</p></div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-emerald-900 sm:grid-cols-3">
                        <div className="rounded-xl bg-white p-3">Harga provider<br/><b>{formatRupiah(Number(inquiry.price || 0))}</b></div>
                        <div className="rounded-xl bg-white p-3">Admin provider<br/><b>{formatRupiah(Number(inquiry.admin || 0))}</b></div>
                        <div className="rounded-xl bg-white p-3">Jatuh tempo/periode<br/><b>{String(inquiry.periode || "-" )}</b></div>
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-emerald-700">Inquiry berlaku 10 menit. Nominal pembayaran dikunci oleh server.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-end justify-between">
              <div><p className="text-xs font-black uppercase tracking-widest text-gold-600">Metode</p><h2 className="mt-1 text-xl font-black">Cara bayar</h2></div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Otomatis</span>
            </div>

            <div className="mt-4 rounded-2xl border-2 border-gold-500 bg-gold-50 p-4">
              <span className="text-2xl">💰</span>
              <p className="mt-2 font-black">Saldo Wallet AIDIL STORE</p>
              <p className="mt-1 text-xs text-slate-500">{formatRupiah(balance)} tersedia</p>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">Untuk saat ini, semua transaksi pembelian produk hanya dapat dibayar menggunakan saldo akun. Jika saldo belum cukup, silakan top up terlebih dahulu.</p>
            </div>
          </div>
        </div>

        <aside className="h-fit rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 lg:sticky lg:top-24">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Ringkasan</p>
          <p className="mt-3 truncate font-bold">{product.name}</p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Harga</span><b>{formatRupiah(product.price)}</b></div>
            <div className="flex justify-between"><span className="text-slate-500">Jumlah</span><b>{qty}</b></div>
            <div className="border-t border-slate-100 pt-3 flex justify-between text-lg"><span className="font-black">Total</span><b className="text-gold-600">{formatRupiah(subtotal)}</b></div>
          </div>

          <div className={`mt-5 rounded-2xl p-3 text-xs font-bold ${enoughBalance ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{enoughBalance ? "✓ Saldo mencukupi." : "Saldo kurang, silakan top up terlebih dahulu."}</div>
          <Button className="mt-4 w-full" onClick={payWallet} loading={confirming} disabled={!enoughBalance || (ppob?.service_kind === "postpaid" && !inquiryId)}>Bayar dengan Saldo</Button>
          {!enoughBalance && <Button variant="secondary" className="mt-2 w-full" onClick={() => router.push(`/wallet/topup?amount=${encodeURIComponent(String(subtotal - balance))}`)}>Top Up Saldo</Button>}

          <div className="mt-5 space-y-2 text-xs text-slate-500">
            <p>🔒 Pembayaran saldo diproses instan & aman.</p>
            <p>📥 Produk digital yang lunas langsung tersedia di Pesanan.</p>
            <p>🚫 Tidak perlu upload bukti transfer atau menunggu approve admin.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="mx-auto max-w-lg animate-pulse rounded-[2rem] bg-white p-8 shadow-sm">Memuat checkout...</div>}><CheckoutForm /></Suspense>;
}