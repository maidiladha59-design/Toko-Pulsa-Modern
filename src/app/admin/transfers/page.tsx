"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
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
    <div className="animate-page-in space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Keuangan</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Transfer Saldo & Limit</h1>
        <p className="mt-1 text-sm text-app-muted">Atur biaya admin, nominal minimum/maksimum, dan limit harian/bulanan transfer antar-pengguna.</p>
      </div>

      {loading ? <LoadingSkeleton rows={5} /> : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Pengaturan Transfer Saldo</CardTitle>
              <CardDescription>Biaya admin dibebankan ke pengirim. Limit dihitung per pengirim (harian & bulanan, zona waktu Jakarta).</CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm font-bold text-app-text">
              <input
                type="checkbox"
                className="h-4 w-4 accent-gold-400"
                checked={config.enabled}
                onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              /> Aktif
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Select
              label="Tipe biaya"
              value={config.fee_type}
              onChange={(e) => setConfig({ ...config, fee_type: e.target.value as TransferConfig["fee_type"] })}
              className="bg-app-inset"
            >
              <option value="FIXED">Nominal tetap</option>
              <option value="PERCENTAGE">Persentase</option>
            </Select>
            <Input
              label={`Nilai biaya ${config.fee_type === "PERCENTAGE" ? "(%)" : "(Rp)"}`}
              type="number"
              min="0"
              step={config.fee_type === "PERCENTAGE" ? "0.01" : "100"}
              value={config.fee_value}
              onChange={(e) => setConfig({ ...config, fee_value: Number(e.target.value) })}
              className="bg-app-inset"
            />
            <Input
              label="Minimal transfer (Rp)"
              type="number"
              min="1000"
              value={config.min_transfer}
              onChange={(e) => setConfig({ ...config, min_transfer: Number(e.target.value) })}
              className="bg-app-inset"
            />
            <Input
              label="Maksimal per transfer (Rp)"
              type="number"
              min="1000"
              value={config.max_transfer}
              onChange={(e) => setConfig({ ...config, max_transfer: Number(e.target.value) })}
              className="bg-app-inset"
            />
            <Input
              label="Limit harian per pengirim (Rp)"
              type="number"
              min="1000"
              value={config.daily_limit}
              onChange={(e) => setConfig({ ...config, daily_limit: Number(e.target.value) })}
              className="bg-app-inset"
            />
            <Input
              label="Limit bulanan per pengirim (Rp)"
              type="number"
              min="1000"
              value={config.monthly_limit}
              onChange={(e) => setConfig({ ...config, monthly_limit: Number(e.target.value) })}
              className="bg-app-inset"
            />
          </div>

          <div className="mt-5 rounded-2xl bg-app-inset p-4 text-xs leading-5 text-app-muted">
            <p className="font-black text-app-text">Ringkasan saat ini</p>
            <p className="mt-1">
              Biaya: <b className="tabular-nums">{config.fee_value > 0 ? (config.fee_type === "PERCENTAGE" ? `${config.fee_value}%` : formatRupiah(config.fee_value)) : "Gratis"}</b> ·
              Rentang nominal: <b className="tabular-nums">{formatRupiah(config.min_transfer)}</b> s.d. <b className="tabular-nums">{formatRupiah(config.max_transfer)}</b> ·
              Limit harian: <b className="tabular-nums">{formatRupiah(config.daily_limit)}</b> · Limit bulanan: <b className="tabular-nums">{formatRupiah(config.monthly_limit)}</b>
            </p>
            {config.updated_at && <p className="mt-1">Terakhir diperbarui: <span className="tabular-nums whitespace-nowrap">{new Date(config.updated_at).toLocaleString("id-ID")}</span></p>}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving}>Simpan Pengaturan</Button>
            <Button variant="outline" onClick={load}>↻ Muat Ulang</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
