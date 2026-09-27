"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";

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

  if (loading) return <div className="rounded-2xl border bg-white p-6">Memuat...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-zinc-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[.2em] text-gold-400">SYSTEM CONTROL</p>
        <h1 className="mt-2 text-2xl font-black">Fitur Aplikasi</h1>
        <p className="mt-2 text-sm text-white/65">Aktifkan atau nonaktifkan fitur untuk pelanggan. Perubahan langsung berlaku.</p>
      </div>

      {!tableReady && (
        <div className="rounded-2xl border border-gold-300 bg-gold-50 p-4 text-sm text-zinc-900">
          Tabel <b>feature_flags</b> belum ada. Jalankan <b>supabase/migrations_v75_feature_flags.sql</b> di Supabase SQL Editor agar pengaturan bisa disimpan.
        </div>
      )}

      <section className="space-y-3">
        {features.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-4 rounded-2xl border border-gold-200 bg-white p-5 shadow-sm">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-black">{f.label}</h2>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${f.enabled ? "bg-gold-400 text-black" : "bg-zinc-950 text-gold-400"}`}>
                  {f.enabled ? "AKTIF" : "NONAKTIF"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{f.description}</p>
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
        ))}
      </section>
    </div>
  );
}