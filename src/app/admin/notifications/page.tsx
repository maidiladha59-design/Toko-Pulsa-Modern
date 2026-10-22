"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { Card, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
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
        <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Notifikasi</p>
        <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Notifikasi untuk Semua Pengguna</h1>
        <p className="mt-1 text-sm text-app-muted">Contoh: saat pulsa sedang diskon 2%, buat notifikasi yang langsung muncul di akun pengguna.</p>
      </div>

      <Card>
        <div className="grid gap-3">
          <Input
            placeholder="Judul — contoh: Pulsa Lagi Diskon 2%!"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="bg-app-inset"
          />
          <Input
            placeholder="Subjudul — contoh: Nikmati harga pulsa lebih hemat hari ini."
            value={form.subtitle}
            onChange={e => setForm({ ...form, subtitle: e.target.value })}
            className="bg-app-inset"
          />
          <textarea
            placeholder="Isi tambahan (opsional)"
            value={form.message}
            onChange={e => setForm({ ...form, message: e.target.value })}
            className="min-h-28 w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
          />
          <label className="flex items-center gap-2 text-sm font-bold">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm({ ...form, is_active: e.target.checked })}
              className="h-4 w-4 accent-gold-400"
            /> Aktif
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={saving} onClick={() => save(false)}>{editing ? "Simpan Perubahan" : "Simpan Draft"}</Button>
            <Button disabled={saving} onClick={() => save(true)}>{saving ? "Mengirim..." : editing ? "Simpan & Kirim" : "Simpan & Kirim ke Semua"}</Button>
            {editing && <Button variant="outline" onClick={() => { setEditing(null); setForm(empty); }}>Batal</Button>}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>Riwayat Broadcast</CardTitle>
        <div className="mt-4 space-y-3">
          {loading ? <LoadingSkeleton rows={5} /> : items.map(x => (
            <div key={x.id} className="rounded-2xl border border-app-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-black text-app-text">{x.title}</p>
                  <p className="mt-1 text-sm font-bold text-app-muted">{x.subtitle}</p>
                  {x.message && <p className="mt-1 text-sm text-app-muted">{x.message}</p>}
                  <p className="mt-2 text-xs text-app-subtle">{x.sent_at ? `Dikirim ${new Date(x.sent_at).toLocaleString("id-ID")}` : "Belum dikirim"}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(x)}>Edit</Button>
                  {x.is_active && <Button size="sm" variant="destructive" onClick={() => disable(x.id)}>Nonaktifkan</Button>}
                </div>
              </div>
            </div>
          ))}
          {!loading && !items.length && <EmptyState icon="📣" title="Belum ada broadcast." />}
        </div>
      </Card>
    </div>
  );
}
