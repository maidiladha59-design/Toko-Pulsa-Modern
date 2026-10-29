"use client";
import { useEffect, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";

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

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PUSH NOTIFICATION</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Kampanye Otomatis</h1>
        <p className="mt-1 text-sm text-app-muted">Kirim pengingat otomatis ke perangkat pelanggan. Promo, diskon, misi, dan voucher tetap dikirim manual lewat menu Monitoring &amp; Notifikasi.</p>
      </div>

      {!ready && (
        <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm leading-6 text-warning-800 dark:text-warning-300">
          Tabel belum ada. Jalankan <b>supabase/migrations_v76_push_campaigns.sql</b> di Supabase SQL Editor.
        </div>
      )}

      {loading ? <LoadingSkeleton rows={5} /> : items.length === 0 ? <EmptyState icon="megaphone" title="Belum ada kampanye" description="Belum ada kampanye otomatis yang tersedia." /> : (
        <div className="space-y-3">
          {items.map((c) => {
            const info = INFO[c.key] || { name: c.key, desc: "", daysLabel: "Hari" };
            return (
              <Card key={c.key}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle>{info.name}</CardTitle>
                      <Badge tone={c.enabled ? "success" : "neutral"} className="px-2 py-0.5">{c.enabled ? "AKTIF" : "NONAKTIF"}</Badge>
                    </div>
                    <CardDescription>{info.desc}</CardDescription>
                    <p className="mt-1 text-xs font-bold text-app-text">Terkirim 7 hari terakhir: {sent7d[c.key] || 0}</p>
                  </div>
                  <button type="button" role="switch" aria-checked={c.enabled} aria-label={`Ubah status ${info.name}`} onClick={() => edit(c.key, { enabled: !c.enabled })}
                    className={`relative h-8 w-14 shrink-0 rounded-full transition ${c.enabled ? "bg-gold-400" : "bg-zinc-300"}`}>
                    <span className={`absolute top-1 h-6 w-6 rounded-full bg-zinc-950 transition-all ${c.enabled ? "left-7" : "left-1"}`} />
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  <Input label="Judul" value={c.title} maxLength={120} onChange={(e) => edit(c.key, { title: e.target.value })} className="bg-app-inset" />
                  <div>
                    <p className="mb-2 text-sm font-bold text-app-text">Pesan</p>
                    <textarea value={c.message} maxLength={300} rows={3} onChange={(e) => edit(c.key, { message: e.target.value })} className="w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input label="Halaman tujuan" value={c.url} onChange={(e) => edit(c.key, { url: e.target.value })} placeholder="/layanan" className="bg-app-inset" />
                    <Input label={info.daysLabel} type="number" min={1} value={c.min_days} onChange={(e) => edit(c.key, { min_days: Number(e.target.value) })} className="bg-app-inset" />
                    <Input label="Jeda kirim ulang (hari)" type="number" min={1} value={c.cooldown_days} onChange={(e) => edit(c.key, { cooldown_days: Number(e.target.value) })} className="bg-app-inset" />
                  </div>
                </div>
                <Button disabled={busy === c.key || !ready} onClick={() => save(c)} className="mt-4">{busy === c.key ? "Menyimpan..." : "Simpan"}</Button>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardTitle>Kirim sekarang</CardTitle>
        <CardDescription>Jadwal otomatis berjalan sekali sehari. Tombol ini menjalankan kampanye aktif saat itu juga (maksimal 200 pengguna per kampanye per proses).</CardDescription>
        <Button disabled={busy === "run" || !ready} onClick={runNow} className="mt-4">{busy === "run" ? "Mengirim..." : <><Icon name="rocket" size={16} />Jalankan sekarang</>}</Button>
      </Card>
    </div>
  );
}