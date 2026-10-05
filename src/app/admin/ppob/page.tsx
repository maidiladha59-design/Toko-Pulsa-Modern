"use client";

import { useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import { formatRupiah } from "@/lib/utils";

export default function AdminPPOBPage() {
  const toast = useToast();
  const [margin, setMargin] = useState("10");
  const [activate, setActivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ fetched: number; created: number; updated: number; skipped: number } | null>(null);

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
      if (!response.ok) throw new Error(data.message || "Sinkronisasi gagal.");
      setResult(data);
      toast.show(`Sinkronisasi selesai: ${data.created} baru, ${data.updated} diperbarui.`, "success");
    } catch (error: any) {
      toast.show(error?.message || "Sinkronisasi gagal.", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-page-in space-y-5">
      <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-zinc-950 p-6 text-white shadow-xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[.2em] text-amber-300">PPOB ENGINE</p>
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">Sinkronisasi PPOB</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">Ambil pricelist provider, buat produk PPOB, simpan SKU provider, hitung harga jual berdasarkan margin, dan aktifkan layanan yang tersedia.</p>
      </div>

      <section className="rounded-2xl border border-app-border bg-app-surface p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-sm font-bold text-app-text">Margin jual (%)
            <input type="number" min="0" max="100" step="0.5" value={margin} onChange={(e) => setMargin(e.target.value)} className="mt-1 w-full rounded-xl border border-app-border px-3 py-3 outline-none focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" />
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-app-border bg-app-inset p-3 text-sm font-bold text-app-text">
            <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} className="h-4 w-4" />
            Aktifkan SKU yang aktif di provider
          </label>
          <Button onClick={sync} loading={loading}>{loading ? "Sinkronisasi..." : "🔄 Sync PPOB"}</Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-app-accent-soft p-4"><p className="text-xs font-bold text-app-kicker">Contoh modal</p><p className="mt-1 text-lg font-black text-app-text">{formatRupiah(10000)}</p></div>
          <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-bold text-amber-700">Margin {margin || 0}%</p><p className="mt-1 text-lg font-black text-app-text">+{formatRupiah(Math.round(10000 * (Number(margin) || 0) / 100))}</p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">Harga jual contoh</p><p className="mt-1 text-lg font-black text-app-text">{formatRupiah(10000 + Math.round(10000 * (Number(margin) || 0) / 100))}</p></div>
        </div>
      </section>

      {result && <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Pricelist', result.fetched], ['Produk baru', result.created], ['Diperbarui', result.updated], ['Dilewati', result.skipped]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-app-border bg-app-surface p-4 shadow-sm"><p className="text-xs font-bold text-app-subtle">{label}</p><p className="mt-1 text-2xl font-black text-app-text">{value}</p></div>)}
      </section>}

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
        <p className="font-black">⚠️ Sebelum transaksi nyata</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Isi <code>DIGIFLAZZ_USERNAME</code> dan <code>DIGIFLAZZ_API_KEY</code> hanya di environment server.</li>
          <li>Uji dahulu dengan <code>DIGIFLAZZ_TESTING=true</code>.</li>
          <li>Pastikan margin dan pemetaan kategori sudah benar sebelum mengaktifkan semua SKU.</li>
          <li>Webhook provider harus diarahkan ke endpoint PPOB AIDIL STORE agar status pending/sukses dapat diperbarui.</li>
        </ul>
      </section>
    </div>
  );
}
