"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { formatRupiah } from "@/lib/utils";

type SyncResult = {
  fetched: number;
  processed: number;
  created: number;
  updated: number;
  saved: number;
  skipped: number;
  skippedReasons: Record<string, number>;
  skippedSamples: Record<string, string[]>;
  fallbackCategory: { count: number; categories: string[] };
  marginPercent: number;
  activate: boolean;
};

const SKIP_LABELS: Record<string, string> = {
  invalid_data: "Data produk tidak lengkap (SKU / nama kosong)",
  price_zero: "Harga provider 0 atau tidak valid (prabayar)",
  duplicate_sku: "SKU sama muncul lebih dari sekali di respons provider",
  slug_collision: "Slug produk bentrok dengan SKU lain",
  product_upsert_error: "Gagal menyimpan produk ke database",
  service_upsert_error: "Gagal menyimpan layanan PPOB ke database",
};

export default function AdminPPOBPage() {
  const toast = useToast();
  const [margin, setMargin] = useState("10");
  const [activate, setActivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function sync() {
    const value = Number(margin);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast.show("Margin harus 0–100%.", "error");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/ppob/pricelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marginPercent: value, activate }),
      });
      const data = await response.json();
      if (!response.ok) {
        const partial = data?.fetched != null ? ` (${data.processed ?? 0}/${data.fetched} SKU diproses sebelum gagal)` : "";
        throw new Error((data.message || "Sinkronisasi gagal.") + partial);
      }
      setResult(data);
      toast.show(`Sinkronisasi selesai: ${data.saved} SKU tersimpan (${data.created} baru, ${data.updated} diperbarui), ${data.skipped} dilewati.`, data.skipped > 0 ? "error" : "success");
    } catch (error: any) {
      toast.show(error?.message || "Sinkronisasi gagal.", "error");
    } finally {
      setLoading(false);
    }
  }

  const skippedList = result ? Object.entries(result.skippedReasons || {}).filter(([, count]) => count > 0) : [];

  return (
    <div className="animate-page-in space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PPOB ENGINE</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Sinkronisasi PPOB</h1>
        <p className="mt-1 text-sm text-app-muted">Ambil pricelist provider, buat produk PPOB, simpan SKU provider, hitung harga jual berdasarkan margin, dan aktifkan layanan yang tersedia.</p>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Input label="Margin jual (%)" type="number" min="0" max="100" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className="bg-app-inset" />
          <label className="flex items-center gap-3 rounded-xl border border-app-border bg-app-inset p-3 text-sm font-bold text-app-text">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="h-4 w-4 accent-gold-400" />
            Aktifkan SKU yang aktif di provider
          </label>
          <Button onClick={sync} loading={loading}>{loading ? "Sinkronisasi..." : "🔄 Sync PPOB"}</Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-app-accent-soft p-4">
            <p className="text-xs font-bold text-app-kicker">Contoh modal</p>
            <p className="mt-1 text-lg font-black text-app-text">{formatRupiah(10000)}</p>
          </div>
          <div className="rounded-xl bg-warning-500/10 p-4">
            <p className="text-xs font-bold text-warning-700 dark:text-warning-400">Margin {margin || 0}%</p>
            <p className="mt-1 text-lg font-black text-app-text">+{formatRupiah(Math.round(10000 * (Number(margin) || 0) / 100))}</p>
          </div>
          <div className="rounded-xl bg-success-500/10 p-4">
            <p className="text-xs font-bold text-success-700 dark:text-success-400">Harga jual contoh</p>
            <p className="mt-1 text-lg font-black text-app-text">{formatRupiah(10000 + Math.round(10000 * (Number(margin) || 0) / 100))}</p>
          </div>
        </div>
      </Card>

      {result && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Pricelist', result.fetched], ['Produk baru', result.created], ['Diperbarui', result.updated], ['Dilewati', result.skipped]].map(([label, value]) => (
          <Card key={String(label)}>
            <p className="text-xs font-bold text-app-subtle">{label}</p>
            <p className="mt-1 text-2xl font-black tabular-nums text-app-text">{value}</p>
          </Card>
        ))}
      </div>}

      {result && <Card>
        <CardTitle>Ringkasan Sinkronisasi</CardTitle>
        <CardDescription>
          {result.saved} dari {result.fetched} SKU yang diterima berhasil disimpan ({result.created} baru, {result.updated} diperbarui), {result.skipped} dilewati.
        </CardDescription>

        {result.skipped === 0 && result.fallbackCategory?.count === 0 && (
          <p className="mt-4 rounded-xl bg-success-500/10 p-3 text-sm font-bold text-success-700 dark:text-success-400">Semua SKU yang diterima berhasil disinkronkan tanpa ada yang dilewati.</p>
        )}

        {skippedList.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-sm font-black text-app-text">SKU yang dilewati beserta alasannya</p>
            {skippedList.map(([reason, count]) => (
              <div key={reason} className="rounded-xl bg-app-inset p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-app-text">{SKIP_LABELS[reason] || reason}</span>
                  <b className="tabular-nums text-app-kicker">{count} SKU</b>
                </div>
                {result.skippedSamples?.[reason]?.length ? (
                  <p className="mt-1 break-words text-xs leading-5 text-app-subtle">Contoh: {result.skippedSamples[reason].join(", ")}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {result.fallbackCategory?.count > 0 && (
          <div className="mt-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-sm leading-6 text-warning-800 dark:text-warning-300">
            <b>{result.fallbackCategory.count} SKU</b> masuk kategori fallback <b>Tagihan Lainnya</b> karena kategorinya belum dikenali pemetaan{result.fallbackCategory.categories?.length ? <>: {result.fallbackCategory.categories.join(", ")}</> : null}. Produknya tetap tersimpan dan bisa dijual; kategorinya bisa dirapikan lewat pemetaan kode.
          </div>
        )}
      </Card>}

      <div className="rounded-3xl border border-warning-500/30 bg-warning-500/10 p-5 text-sm leading-6 text-warning-800 dark:text-warning-300">
        <p className="font-black">⚠️ Sebelum transaksi nyata</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Isi <code>DIGIFLAZZ_USERNAME</code> dan <code>DIGIFLAZZ_API_KEY</code> hanya di environment server.</li>
          <li>Uji dahulu dengan <code>DIGIFLAZZ_TESTING=true</code>.</li>
          <li>Pastikan margin dan pemetaan kategori sudah benar sebelum mengaktifkan semua SKU.</li>
          <li>Webhook provider harus diarahkan ke endpoint PPOB AIDIL STORE agar status pending/sukses dapat diperbarui.</li>
        </ul>
      </div>
    </div>
  );
}
