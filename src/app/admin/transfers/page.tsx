"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import { formatRupiah } from "@/lib/utils";

type TransferConfig = {
  enabled: boolean;
  fee_type: "FIXED" | "PERCENTAGE";
  fee_value: number;
  min_transfer: number;
  max_transfer: number;
  daily_limit: number;
  monthly_limit: number;
  updated_at?: string;
};

export default function AdminTransfersPage() {
  const toast = useToast();
  const [config, setConfig] = useState<TransferConfig>({
    enabled: true,
    fee_type: "FIXED",
    fee_value: 0,
    min_transfer: 1000,
    max_transfer: 10000000,
    daily_limit: 25000000,
    monthly_limit: 500000000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/transfer-settings");
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal memuat pengaturan transfer.", "error"); return; }
      setConfig(json);
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/transfer-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal menyimpan pengaturan transfer.", "error"); return; }
      setConfig(json);
      toast.show("Pengaturan transfer berhasil disimpan.", "success");
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-page-in">
      <div className="mb-5">
        <p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">Keuangan</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Transfer Saldo & Limit</h1>
        <p className="mt-1 text-sm text-slate-500">Atur biaya admin, nominal minimum/maksimum, dan limit harian/bulanan transfer antar-pengguna.</p>
      </div>

      {loading ? (
        <div className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Memuat pengaturan transfer...</div>
      ) : (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-900">Pengaturan Transfer Saldo</h2>
              <p className="text-xs text-slate-500">Biaya admin dibebankan ke pengirim. Limit dihitung per pengirim (harian & bulanan, zona waktu Jakarta).</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} /> Aktif
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm font-bold text-slate-700">Tipe biaya
              <select value={config.fee_type} onChange={(e) => setConfig({ ...config, fee_type: e.target.value as TransferConfig["fee_type"] })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <option value="FIXED">Nominal tetap</option>
                <option value="PERCENTAGE">Persentase</option>
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">Nilai biaya {config.fee_type === "PERCENTAGE" ? "(%)" : "(Rp)"}
              <input type="number" min="0" step={config.fee_type === "PERCENTAGE" ? "0.01" : "100"} value={config.fee_value} onChange={(e) => setConfig({ ...config, fee_value: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </label>
            <label className="text-sm font-bold text-slate-700">Minimal transfer (Rp)
              <input type="number" min="1000" value={config.min_transfer} onChange={(e) => setConfig({ ...config, min_transfer: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </label>
            <label className="text-sm font-bold text-slate-700">Maksimal per transfer (Rp)
              <input type="number" min="1000" value={config.max_transfer} onChange={(e) => setConfig({ ...config, max_transfer: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </label>
            <label className="text-sm font-bold text-slate-700">Limit harian per pengirim (Rp)
              <input type="number" min="1000" value={config.daily_limit} onChange={(e) => setConfig({ ...config, daily_limit: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </label>
            <label className="text-sm font-bold text-slate-700">Limit bulanan per pengirim (Rp)
              <input type="number" min="1000" value={config.monthly_limit} onChange={(e) => setConfig({ ...config, monthly_limit: Number(e.target.value) })} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5" />
            </label>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
            <p className="font-black text-slate-700">Ringkasan saat ini</p>
            <p className="mt-1">
              Biaya: <b>{config.fee_value > 0 ? (config.fee_type === "PERCENTAGE" ? `${config.fee_value}%` : formatRupiah(config.fee_value)) : "Gratis"}</b> ·
              Rentang nominal: <b>{formatRupiah(config.min_transfer)}</b> s.d. <b>{formatRupiah(config.max_transfer)}</b> ·
              Limit harian: <b>{formatRupiah(config.daily_limit)}</b> · Limit bulanan: <b>{formatRupiah(config.monthly_limit)}</b>
            </p>
            {config.updated_at && <p className="mt-1">Terakhir diperbarui: {new Date(config.updated_at).toLocaleString("id-ID")}</p>}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving}>Simpan Pengaturan</Button>
            <button onClick={load} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm">↻ Muat Ulang</button>
          </div>
        </section>
      )}
    </div>
  );
}
