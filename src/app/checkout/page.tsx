"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import { formatRupiah } from "@/lib/utils";
import { guideFor } from "@/lib/ppob/target-guide";

type Product = { id: string; name: string; price: number; thumbnail_url: string | null; product_type?: string };
type PPOBService = { id: string; provider: string; provider_sku: string; service_kind: "prepaid" | "postpaid"; category: string; brand: string | null; target_schema: { fields?: Array<{ name: string; label: string; type?: string; required?: boolean; placeholder?: string }> } | null };
const MAX_TARGET_FILE_SIZE = 100 * 1024 * 1024;

function CheckoutSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[480px] animate-pulse space-y-4 px-4 py-6" aria-busy="true">
      <div className="h-14 w-2/3 rounded-xl bg-app-surface" />
      <div className="h-32 rounded-[2rem] bg-app-surface" />
      <div className="h-64 rounded-[2rem] bg-app-surface" />
      <div className="h-40 rounded-[2rem] bg-app-surface" />
    </div>
  );
}

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
  const [pin, setPin] = useState("");

  const idempotencyKey = useMemo(
    () => `${productId}-${qty}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    [productId, qty]
  );
  const isJasa = product?.product_type === "jasa";
  const guide = useMemo(
    () => (ppob && product ? guideFor({ category: ppob.category, brand: ppob.brand, productName: product.name, serviceKind: ppob.service_kind, schemaFields: ppob.target_schema?.fields || null }) : null),
    [ppob, product]
  );
  const customerNo = guide ? guide.compose(ppobTargets) : "";
  const targetError = guide ? guide.validate(ppobTargets) : null;
  const targetDetected = guide?.detect ? guide.detect(ppobTargets) : null;
  const hasTargetInput = Object.values(ppobTargets).some((v) => String(v || "").trim());

  // isi ulang kolom sesuai panduan produk
  useEffect(() => {
    if (!guide) return;
    setPpobTargets((prev) => {
      const next: Record<string, string> = {};
      for (const f of guide.fields) next[f.name] = prev[f.name] || "";
      return next;
    });
  }, [guide]);

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
    const problem = guide?.validate(ppobTargets);
    if (problem) {
      toast.show(problem, "error");
      return false;
    }
    if (ppob.service_kind === "postpaid" && !inquiryId) {
      toast.show("Cek tagihan terlebih dahulu sebelum pembayaran.", "error");
      return false;
    }
    return true;
  }

  async function runInquiry() {
    if (!ppob || ppob.service_kind !== "postpaid") return;
    const problem = guide?.validate(ppobTargets);
    if (problem || !customerNo) { toast.show(problem || "Nomor pelanggan wajib diisi.", "error"); return; }
    setInquiring(true);
    try {
      const res = await fetch("/api/ppob/inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service_id: ppob.id, customer_no: customerNo }) });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Cek tagihan gagal.", "error"); return; }
      setInquiryId(json.inquiry_id);
      setInquiry({ ...(json.data || {}), ...(json.breakdown || {}), quote_amount: json.amount, expires_at: json.expires_at });
    } catch { toast.show("Cek tagihan gagal karena koneksi bermasalah.", "error"); } finally { setInquiring(false); }
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
    if (!/^\d{6}$/.test(pin)) {
      toast.show("Masukkan PIN transaksi 6 digit untuk melanjutkan.", "error");
      return;
    }
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
          body: JSON.stringify({ inquiry_id: inquiryId, idempotency_key: idempotencyKey, method: "WALLET", pin }),
        });
        const json = await res.json();
        if (!res.ok) { toast.show(json.message || "Pembayaran tagihan gagal.", "error"); return; }
        toast.show("Tagihan dibayar dan sedang diproses otomatis.", "success");
        router.push(`/orders/${json.order_id}`);
        return;
      }
      const endpoint = ppob?.service_kind === "prepaid" ? "/api/ppob/prepaid/pay" : "/api/checkout";
      const body = ppob?.service_kind === "prepaid"
        ? { product_id: product.id, customer_no: customerNo, target_data: { ...ppobTargets, customer_no: customerNo }, idempotency_key: idempotencyKey, pin }
        : { items: [{ product_id: product.id, quantity: qty }], idempotency_key: idempotencyKey, pin, targets: ppob ? { [product.id]: { customer_no: customerNo, target_data: { ...ppobTargets, customer_no: customerNo } } } : undefined };
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

  if (!productId || qty < 1) return <div className="mx-auto w-full max-w-[480px] px-4 py-10"><p className="text-sm text-app-muted">Parameter produk atau jumlah tidak valid.</p></div>;
  if (loading) return <CheckoutSkeleton />;
  if (!product) return <div className="mx-auto w-full max-w-[480px] px-4 py-10"><p className="text-sm text-app-muted">Produk tidak ditemukan.</p></div>;

  const subtotal = ppob?.service_kind === "postpaid" && inquiry ? Number(inquiry.quote_amount || inquiry.selling_price || 0) : product.price * qty;
  const enoughBalance = balance >= subtotal;

  return (
    <div className="customer-shell"><div className="mx-auto w-full max-w-[480px] animate-page-in pb-28 lg:max-w-5xl lg:pb-0">
      <div className="mb-6 flex items-start gap-3">
        <button type="button" onClick={() => router.back()} aria-label="Kembali" className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-app-border bg-app-surface text-lg text-app-text transition hover:border-gold-400/50 hover:text-app-kicker">←</button>
        <img src="/aidil-logo.png" alt="Aidil Store" className="h-11 w-11 rounded-2xl object-cover" />
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-app-kicker">AIDIL STORE</p><h1 className="text-xl font-black text-app-text sm:text-2xl">Checkout Aman & Otomatis</h1><p className="text-sm text-app-muted">Bayar tanpa approve manual, lalu akses produk digital dari pesanan.</p></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div className="rounded-[2rem] border border-app-border bg-app-surface p-5">
            <div className="flex gap-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-app-inset">
                {product.thumbnail_url ? <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl">🛍️</div>}
              </div>
              <div className="min-w-0">
                <p className="font-black text-app-text">{product.name}</p>
                <p className="mt-1 text-sm text-app-muted">Jumlah: <span className="tabular-nums">{qty}</span></p>
                <p className="mt-3 text-lg font-black tabular-nums text-app-kicker">{formatRupiah(product.price)} / item</p>
              </div>
            </div>
          </div>

          {isJasa && (
            <div className="rounded-[2rem] border border-gold-400/30 bg-app-accent-soft p-5">
              <p className="font-black text-app-text">Target pesanan jasa</p>
              <p className="mt-1 text-xs leading-5 text-app-muted">Masukkan link/catatan atau file yang dibutuhkan agar pesanan dapat diproses.</p>
              <textarea value={targetText} onChange={(e) => setTargetText(e.target.value)} rows={4} placeholder="Link, username, catatan, atau detail pesanan..." className="mt-3 w-full rounded-2xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" />
              <input type="file" onChange={(e) => chooseTargetFile(e.target.files?.[0])} className="mt-3 block w-full text-sm text-app-text file:mr-3 file:rounded-xl file:border-0 file:bg-app-inset file:px-3 file:py-2 file:text-xs file:font-black file:text-app-text" />
              {targetFile && <p className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">✓ {targetFile.name}</p>}
            </div>
          )}

          {ppob && guide && (
            <div className="rounded-[2rem] border border-app-border bg-app-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-black text-app-text">{guide.heading}</p><p className="mt-1 text-xs leading-5 text-app-muted">{guide.intro}</p></div>
                <span className="shrink-0 rounded-full bg-app-inset px-3 py-1 text-[10px] font-black uppercase text-app-kicker ring-1 ring-gold-400/30">{ppob.service_kind === "postpaid" ? "Cek tagihan dulu" : "Proses otomatis"}</span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {guide.fields.map((field) => (
                  <label key={field.name} className={guide.fields.length === 1 ? "sm:col-span-2" : ""}>
                    <span className="text-xs font-black text-app-text">{field.label}{field.required !== false ? " *" : ""}</span>
                    <input
                      value={ppobTargets[field.name] || ""}
                      onChange={(e) => {
                        const value = field.numeric ? e.target.value.replace(/\D/g, "") : e.target.value;
                        setPpobTargets((v) => ({ ...v, [field.name]: value }));
                        if (ppob.service_kind === "postpaid") { setInquiry(null); setInquiryId(null); }
                      }}
                      placeholder={field.placeholder}
                      inputMode={field.inputMode}
                      maxLength={field.maxLength}
                      autoComplete="off"
                      className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
                    />
                  </label>
                ))}
              </div>
              {targetDetected && !targetError && <p className="mt-3 text-xs font-black text-emerald-600 dark:text-emerald-400">✓ {targetDetected}</p>}
              {hasTargetInput && targetError && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-bold leading-5 text-red-600 dark:text-red-400">{targetError}</p>}
              <ul className="mt-4 space-y-1.5 rounded-2xl bg-app-inset/60 p-3 text-[11px] leading-5 text-app-muted">
                {guide.tips.map((tip) => <li key={tip}>• {tip}</li>)}
              </ul>
              {ppob.service_kind === "postpaid" && (
                <div className="mt-4 rounded-2xl border border-app-border bg-app-inset/60 p-4">
                  <button type="button" onClick={runInquiry} disabled={inquiring} className="min-h-[44px] rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-gold-300 disabled:opacity-60">{inquiring ? "Mengecek..." : "Cek Tagihan"}</button>
                  {inquiry && (
                    <div className="mt-3 rounded-2xl border border-app-border bg-app-surface p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-xs font-bold text-app-muted">Pelanggan</p><p className="font-black text-app-text">{inquiry.customer_name || inquiry.customer_no || ppobTargets.customer_no}</p></div>
                        <div className="text-right"><p className="text-xs font-bold text-app-muted">Total tagihan</p><p className="text-xl font-black tabular-nums text-app-kicker">{formatRupiah(Number(inquiry.quote_amount || inquiry.selling_price || 0))}</p></div>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-app-muted sm:grid-cols-3">
                        <div className="rounded-xl bg-app-inset p-3">Tagihan pokok<br/><b className="tabular-nums text-app-text">{formatRupiah(Number(inquiry.price || 0))}</b></div>
                        <div className="rounded-xl bg-app-inset p-3">Biaya admin<br/><b className="tabular-nums text-app-text">{formatRupiah(Number(inquiry.admin || 0))}</b></div>
                        <div className="rounded-xl bg-app-inset p-3">Jatuh tempo/periode<br/><b className="text-app-text">{String(inquiry.periode || "-" )}</b></div>
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-app-muted">Tagihan ini berlaku 10 menit. Nominal yang dibayar sudah dikunci dan aman.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="rounded-[2rem] border border-app-border bg-app-surface p-5">
            <div className="flex items-end justify-between">
              <div><p className="text-xs font-black uppercase tracking-widest text-app-kicker">Metode</p><h2 className="mt-1 text-xl font-black text-app-text">Cara bayar</h2></div>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">Otomatis</span>
            </div>

            <div className="mt-4 rounded-2xl border border-gold-400/60 bg-app-accent-soft p-4">
              <span className="text-2xl">💰</span>
              <p className="mt-2 font-black text-app-text">Saldo Wallet AIDIL STORE</p>
              <p className="mt-1 text-xs text-app-muted"><span className="font-bold tabular-nums text-app-kicker">{formatRupiah(balance)}</span> tersedia</p>
              <p className="mt-3 text-[11px] leading-5 text-app-muted">Untuk saat ini, semua transaksi pembelian produk hanya dapat dibayar menggunakan saldo akun. Jika saldo belum cukup, silakan top up terlebih dahulu.</p>
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-app-text">PIN Transaksi *</span>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="6 digit PIN"
                className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm tracking-[.4em] text-app-text outline-none transition placeholder:tracking-normal placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
              />
              <span className="mt-1 block text-[11px] text-app-subtle">Belum punya PIN? <a href="/settings" className="font-bold text-app-kicker underline">Buat di Pengaturan</a>.</span>
            </label>
          </div>
        </div>

        <aside className="h-fit rounded-[2rem] border border-app-border bg-app-surface p-6 lg:sticky lg:top-24">
          <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Ringkasan</p>
          <p className="mt-3 truncate font-bold text-app-text">{product.name}</p>
          <div className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-app-muted">Harga</span><b className="tabular-nums text-app-text">{formatRupiah(product.price)}</b></div>
            <div className="flex justify-between"><span className="text-app-muted">Jumlah</span><b className="tabular-nums text-app-text">{qty}</b></div>
            <div className="flex justify-between border-t border-app-border pt-3 text-lg"><span className="font-black text-app-text">Total</span><b className="tabular-nums text-app-kicker">{formatRupiah(subtotal)}</b></div>
          </div>

          <div className={`sticky bottom-[76px] z-30 -mx-6 -mb-6 mt-5 space-y-2 border-t border-app-border bg-app-surface/95 px-6 pb-5 pt-4 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:backdrop-blur-none`}>
            <div className={`rounded-2xl p-3 text-xs font-bold ${enoughBalance ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-red-500/10 text-red-600 dark:text-red-400"}`}>{enoughBalance ? "✓ Saldo mencukupi." : "Saldo kurang, silakan top up terlebih dahulu."}</div>
            <button type="button" onClick={payWallet} disabled={confirming || !enoughBalance || (ppob?.service_kind === "postpaid" && !inquiryId)} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gold-400 px-4 py-3 text-sm font-black text-zinc-950 transition hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50">
              {confirming && <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />}Bayar dengan Saldo
            </button>
            {!enoughBalance && <button type="button" onClick={() => router.push(`/wallet/topup?amount=${encodeURIComponent(String(subtotal - balance))}`)} className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-app-border px-4 py-3 text-sm font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker">Top Up Saldo</button>}
          </div>

          <div className="mt-5 space-y-2 text-xs leading-5 text-app-subtle">
            <p>🔒 Pembayaran saldo diproses instan & aman.</p>
            <p>📥 Produk digital yang lunas langsung tersedia di Pesanan.</p>
            <p>🚫 Tidak perlu upload bukti transfer atau menunggu approve admin.</p>
          </div>
        </aside>
      </div>
    </div>
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<CheckoutSkeleton />}><CheckoutForm /></Suspense>;
}
