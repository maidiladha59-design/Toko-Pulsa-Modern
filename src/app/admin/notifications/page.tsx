"use client";

import { useEffect, useState } from "react";
import Button from "@/components/Button";
import { useToast } from "@/components/ToastProvider";

type Broadcast = {
  id: string;
  title: string;
  subtitle: string;
  message: string;
  is_active: boolean;
  sent_at: string | null;
  created_at: string;
};

const empty = { title: "", subtitle: "", message: "", is_active: true };

export default function AdminNotifications() {
  const [items, setItems] = useState<Broadcast[]>([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    const r = await fetch("/api/admin/notification-broadcasts", { cache: "no-store" });
    const j = await r.json();
    setItems(j.broadcasts || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function save(publish: boolean) {
    setSaving(true);
    const r = await fetch("/api/admin/notification-broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, id: editing, publish }),
    });
    const j = await r.json();
    setSaving(false);
    if (!r.ok) return toast.show(j.message || "Gagal menyimpan.", "error");
    toast.show(publish ? `Notifikasi dikirim ke ${j.sent ?? "pengguna"} akun.` : "Draft notifikasi tersimpan.", "success");
    setForm(empty);
    setEditing(null);
    load();
  }

  function edit(x: Broadcast) {
    setEditing(x.id);
    setForm({ title: x.title, subtitle: x.subtitle, message: x.message, is_active: x.is_active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function disable(id: string) {
    const r = await fetch("/api/admin/notification-broadcasts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (r.ok) { toast.show("Notifikasi dinonaktifkan.", "success"); load(); }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="section-kicker">Notifikasi</p>
        <h1 className="text-2xl font-black">Notifikasi untuk Semua Pengguna</h1>
        <p className="mt-1 text-sm text-slate-500">Contoh: saat pulsa sedang diskon 2%, buat notifikasi yang langsung muncul di akun pengguna.</p>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="grid gap-3">
          <input className="rounded-xl border p-3" placeholder="Judul — contoh: Pulsa Lagi Diskon 2%!" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="rounded-xl border p-3" placeholder="Subjudul — contoh: Nikmati harga pulsa lebih hemat hari ini." value={form.subtitle} onChange={e => setForm({ ...form, subtitle: e.target.value })} />
          <textarea className="min-h-28 rounded-xl border p-3" placeholder="Isi tambahan (opsional)" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Aktif</label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save(false)}>{editing ? "Simpan Perubahan" : "Simpan Draft"}</Button>
            <button disabled={saving} onClick={() => save(true)} className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-60">{saving ? "Mengirim..." : editing ? "Simpan & Kirim" : "Simpan & Kirim ke Semua"}</button>
            {editing && <button onClick={() => { setEditing(null); setForm(empty); }} className="rounded-xl border px-4 py-3 text-sm font-bold">Batal</button>}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <h2 className="font-black">Riwayat Broadcast</h2>
        <div className="mt-4 space-y-3">
          {loading ? <p className="text-sm text-slate-400">Memuat...</p> : items.map(x => (
            <div key={x.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black">{x.title}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">{x.subtitle}</p>
                  {x.message && <p className="mt-1 text-sm text-slate-500">{x.message}</p>}
                  <p className="mt-2 text-xs text-slate-400">{x.sent_at ? `Dikirim ${new Date(x.sent_at).toLocaleString("id-ID")}` : "Belum dikirim"}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => edit(x)} className="rounded-xl border px-3 py-2 text-xs font-bold">Edit</button>
                  {x.is_active && <button onClick={() => disable(x.id)} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Nonaktifkan</button>}
                </div>
              </div>
            </div>
          ))}
          {!loading && !items.length && <p className="text-sm text-slate-400">Belum ada broadcast.</p>}
        </div>
      </div>
    </div>
  );
}
