"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import { Card } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";

type Feature = { key: string; label: string; description: string; enabled: boolean };

export default function AdminFeaturesPage() {
  const toast = useToast();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [tableReady, setTableReady] = useState(true);

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/features", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setFeatures(j.features || []); setTableReady(j.tableReady !== false); }
    else toast.show(j.message || "Gagal memuat fitur", "error");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function toggle(f: Feature) {
    setBusyKey(f.key);
    const r = await fetch("/api/admin/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: f.key, enabled: !f.enabled }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast.show(j.message || "Gagal menyimpan", "error");
    else { toast.show(`${f.label} ${!f.enabled ? "diaktifkan" : "dinonaktifkan"}`, "success"); await load(); }
    setBusyKey("");
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">SYSTEM CONTROL</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Fitur Aplikasi</h1>
        <p className="mt-1 text-sm text-app-muted">Aktifkan atau nonaktifkan fitur untuk pelanggan. Perubahan langsung berlaku.</p>
      </div>

      {!tableReady && (
        <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm leading-6 text-warning-800 dark:text-warning-300">
          Tabel <b>feature_flags</b> belum ada. Jalankan <b>supabase/migrations_v75_feature_flags.sql</b> di Supabase SQL Editor agar pengaturan bisa disimpan.
        </div>
      )}

      {loading ? <LoadingSkeleton rows={5} /> : features.length === 0 ? <EmptyState icon="puzzle" title="Belum ada fitur" description="Belum ada feature flag yang tersedia untuk diatur." /> : (
        <div className="space-y-3">
          {features.map((f) => (
            <Card key={f.key} className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-app-text">{f.label}</p>
                    <Badge tone={f.enabled ? "success" : "neutral"} className="px-2 py-0.5">{f.enabled ? "AKTIF" : "NONAKTIF"}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-app-muted">{f.description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.enabled}
                  aria-label={`Ubah status ${f.label}`}
                  disabled={busyKey === f.key || !tableReady}
                  onClick={() => toggle(f)}
                  className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${f.enabled ? "bg-gold-400" : "bg-zinc-300"}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition-all ${f.enabled ? "left-7" : "left-1"}`} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}