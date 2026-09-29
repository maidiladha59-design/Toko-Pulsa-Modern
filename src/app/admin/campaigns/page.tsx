"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";

type Campaign = { key: string; title: string; message: string; url: string; min_days: number; cooldown_days: number; enabled: boolean };

const INFO: Record<string, { name: string; desc: string; daysLabel: string }> = {
  NO_TRANSACTION: { name: "Belum pernah belanja", desc: "Dikirim ke pengguna yang sudah mendaftar beberapa hari tetapi belum punya transaksi berhasil.", daysLabel: "Dikirim setelah daftar (hari)" },
  INACTIVE: { name: "Lama tidak belanja", desc: "Dikirim ke pelanggan yang pernah belanja tetapi sudah lama tidak bertransaksi.", daysLabel: "Tidak belanja selama (hari)" },
};

export default function AdminCampaignsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Campaign[]>([]);
  const [sent7d, setSent7d] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState("");

  async function load() {
    const r = await fetch("/api/admin/campaigns", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setItems(j.campaigns || []); setSent7d(j.sent7d || {}); setReady(j.tableReady !== false); }
    else toast.show(j.message || "Gagal memuat kampanye", "error");
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function edit(key: string, patch: Partial<Campaign>) {
    setItems((list) => list.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  async function save(c: Campaign) {
    setBusy(c.key);
    const r = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
    const j = await r.json().catch(() => ({}));
    toast.show(r.ok ? "Kampanye disimpan." : (j.message || "Gagal menyimpan"), r.ok ? "success" : "error");
    setBusy("");
  }

  async function runNow() {
    if (!confirm("Kirim semua kampanye AKTIF sekarang ke pengguna yang memenuhi syarat?")) return;
    setBusy("run");
    const r = await fetch("/api/admin/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run" }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) {
      const total = Object.values(j.results || {}).reduce((a: number, v: any) => a + (v?.sent || 0), 0);
      toast.show(`Selesai. ${total} notifikasi terkirim.`, "success");
      await load();
    } else toast.show(j.message || "Gagal menjalankan", "error");
    setBusy("");
  }

  if (loading) return <div className="rounded-2xl border bg-white p-6">Memuat...</div>;

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-zinc-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[.2em] text-gold-400">PUSH NOTIFICATION</p>
        <h1 className="mt-2 text-2xl font-black">Kampanye Otomatis</h1>
        <p className="mt-2 text-sm text-white/65">Kirim pengingat otomatis ke perangkat pelanggan. Promo, diskon, misi, dan voucher tetap dikirim manual lewat menu Monitoring &amp; Notifikasi.</p>
      </div>

      {!ready && (
        <div className="rounded-2xl border border-gold-300 bg-gold-50 p-4 text-sm text-zinc-900">
          Tabel belum ada. Jalankan <b>supabase/migrations_v76_push_campaigns.sql</b> di Supabase SQL Editor.
        </div>
      )}

      {items.map((c) => {
        const info = INFO[c.key] || { name: c.key, desc: "", daysLabel: "Hari" };
        return (
          <section key={c.key} className="space-y-4 rounded-2xl border border-gold-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-black">{info.name}</h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${c.enabled ? "bg-gold-400 text-black" : "bg-zinc-950 text-gold-400"}`}>{c.enabled ? "AKTIF" : "NONAKTIF"}</span>
                </div>
                <p className="mt-1 text-sm text-slate-500">{info.desc}</p>
                <p className="mt-1 text-xs font-bold text-zinc-700">Terkirim 7 hari terakhir: {sent7d[c.key] || 0}</p>
              </div>
              <button type="button" role="switch" aria-checked={c.enabled} aria-label={`Ubah status ${info.name}`} onClick={() => edit(c.key, { enabled: !c.enabled })}
                className={`relative h-8 w-14 shrink-0 rounded-full transition ${c.enabled ? "bg-gold-400" : "bg-zinc-300"}`}>
                <span className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition-all ${c.enabled ? "left-7" : "left-1"}`} />
              </button>
            </div>

            <label className="block text-sm font-bold">Judul
              <input value={c.title} maxLength={120} onChange={(e) => edit(c.key, { title: e.target.value })} className="mt-2 w-full rounded-xl border p-3 font-normal" />
            </label>
            <label className="block text-sm font-bold">Pesan
              <textarea value={c.message} maxLength={300} rows={3} onChange={(e) => edit(c.key, { message: e.target.value })} className="mt-2 w-full rounded-xl border p-3 font-normal" />
            </label>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block text-sm font-bold">Halaman tujuan
                <input value={c.url} onChange={(e) => edit(c.key, { url: e.target.value })} placeholder="/layanan" className="mt-2 w-full rounded-xl border p-3 font-normal" />
              </label>
              <label className="block text-sm font-bold">{info.daysLabel}
                <input type="number" min={1} value={c.min_days} onChange={(e) => edit(c.key, { min_days: Number(e.target.value) })} className="mt-2 w-full rounded-xl border p-3 font-normal" />
              </label>
              <label className="block text-sm font-bold">Jeda kirim ulang (hari)
                <input type="number" min={1} value={c.cooldown_days} onChange={(e) => edit(c.key, { cooldown_days: Number(e.target.value) })} className="mt-2 w-full rounded-xl border p-3 font-normal" />
              </label>
            </div>
            <button disabled={busy === c.key || !ready} onClick={() => save(c)} className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-black text-gold-400 disabled:opacity-50">
              {busy === c.key ? "Menyimpan..." : "Simpan"}
            </button>
          </section>
        );
      })}

      <section className="rounded-2xl border border-gold-200 bg-white p-5 shadow-sm">
        <h2 className="font-black">Kirim sekarang</h2>
        <p className="mt-1 text-sm text-slate-500">Jadwal otomatis berjalan sekali sehari. Tombol ini menjalankan kampanye aktif saat itu juga (maksimal 200 pengguna per kampanye per proses).</p>
        <button disabled={busy === "run" || !ready} onClick={runNow} className="mt-4 rounded-xl bg-gold-400 px-5 py-3 text-sm font-black text-black disabled:opacity-50">
          {busy === "run" ? "Mengirim..." : "🚀 Jalankan sekarang"}
        </button>
      </section>
    </div>
  );
}