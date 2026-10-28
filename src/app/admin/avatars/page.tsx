"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Input from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import UserAvatar from "@/components/UserAvatar";

type AvatarAdmin = {
  id: string;
  image_url: string;
  label: string | null;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  usage_count: number;
};

type Pending = { key: string; name: string; blob: Blob; preview: string };

const MAX_BYTES = 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

// Cropping 1:1 500x500 dilakukan di browser (canvas) karena proyek berjalan
// di Vercel tanpa modul pemroses gambar di server; server tetap memvalidasi
// tipe (magic byte), ukuran, dan menyimpan file ke Supabase Storage.
async function toSquareBlob(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 500;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    500,
    500
  );
  bitmap.close?.();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/webp", 0.88));
  if (webp) return webp;
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.88)
  );
}

export default function AdminAvatarsPage() {
  const toast = useToast();
  const [items, setItems] = useState<AvatarAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AvatarAdmin | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/avatars").catch(() => null);
    const json = await res?.json().catch(() => null);
    if (!res?.ok) {
      setError(json?.message || "Gagal memuat koleksi foto profil.");
      setLoading(false);
      return;
    }
    setItems(json.avatars || []);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function pickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const next: Pending[] = [];
    for (const file of Array.from(list)) {
      if (!ALLOWED.includes(file.type)) {
        toast.show(`${file.name}: hanya PNG, JPG, atau WEBP.`, "error");
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast.show(`${file.name}: ukuran maksimal 1MB per file.`, "error");
        continue;
      }
      try {
        const blob = await toSquareBlob(file);
        if (blob.size > MAX_BYTES) {
          toast.show(`${file.name}: hasil olah ulang masih di atas 1MB, gunakan gambar lebih kecil.`, "error");
          continue;
        }
        next.push({ key: `${file.name}-${file.lastModified}-${next.length}`, name: file.name, blob, preview: URL.createObjectURL(blob) });
      } catch {
        toast.show(`${file.name}: gagal mengolah gambar.`, "error");
      }
    }
    setPending((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function upload() {
    if (pending.length === 0) return;
    setUploading(true);
    const form = new FormData();
    form.append("label", label);
    for (const p of pending) form.append("files", p.blob, p.name.replace(/\.[^.]+$/, "") + ".webp");
    const res = await fetch("/api/admin/avatars", { method: "POST", body: form }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setUploading(false);
    if (!res?.ok) {
      toast.show(json?.message || "Gagal mengunggah foto profil.", "error");
      return;
    }
    const rejected: string[] = json.rejected || [];
    toast.show(
      `${json.avatars.length} foto profil ditambahkan.${rejected.length ? ` Ditolak: ${rejected.join(" ")}` : ""}`,
      rejected.length ? "info" : "success"
    );
    for (const p of pending) URL.revokeObjectURL(p.preview);
    setPending([]);
    setLabel("");
    await load();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    const res = await fetch(`/api/admin/avatars/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusyId(null);
    if (!res?.ok) {
      toast.show(json?.message || "Gagal memperbarui avatar.", "error");
      return;
    }
    await load();
  }

  async function remove(avatar: AvatarAdmin) {
    setBusyId(avatar.id);
    const res = await fetch(`/api/admin/avatars/${avatar.id}`, { method: "DELETE" }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setBusyId(null);
    setConfirmDelete(null);
    if (!res?.ok) {
      toast.show(json?.message || "Gagal menghapus avatar.", "error");
      return;
    }
    toast.show(
      json.affected_users > 0
        ? `Avatar dihapus. ${json.affected_users} pengguna kembali ke avatar default.`
        : "Avatar dihapus.",
      "success"
    );
    await load();
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-widest text-app-kicker">PANEL ADMIN</p>
            <h1 className="mt-1 break-words text-xl font-black text-app-text sm:text-2xl">Foto Profil</h1>
            <p className="mt-1 text-sm leading-5 text-app-muted">
              Koleksi avatar yang bisa dipilih pengguna di beranda. Avatar nonaktif tidak muncul di pemilih;
              pengguna yang memakai avatar terhapus otomatis kembali ke avatar default.
            </p>
          </div>
          <Button variant="outline" onClick={load} className="px-4 py-2.5">↻ Muat ulang</Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-black text-app-text">Tambah foto profil</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor="avatar-label" className="text-xs font-bold text-app-muted">Label (opsional)</label>
            <Input
              id="avatar-label"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Mis. Maskot, Karakter 1"
              className="mt-1"
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="avatar-files" className="text-xs font-bold text-app-muted">Gambar (PNG/JPG/WEBP, maks 1MB, bisa banyak)</label>
            <input
              id="avatar-files"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(e) => pickFiles(e.target.files)}
              className="mt-1 block w-full cursor-pointer rounded-xl border border-app-border bg-app-inset px-3 py-2 text-xs text-app-muted file:mr-3 file:rounded-lg file:border-0 file:bg-gold-400 file:px-3 file:py-1.5 file:text-xs file:font-black file:text-zinc-950"
            />
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-app-muted">Pratinjau (dipotong 1:1, 500×500)</p>
            <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {pending.map((p) => (
                <div key={p.key} className="min-w-0">
                  <div className="relative">
                    <img src={p.preview} alt={p.name} width={120} height={120} className="aspect-square w-full rounded-full object-cover ring-1 ring-app-border" />
                    <button
                      onClick={() => { URL.revokeObjectURL(p.preview); setPending((prev) => prev.filter((x) => x.key !== p.key)); }}
                      aria-label={`Batalkan ${p.name}`}
                      className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-danger-600 text-xs font-black text-white"
                    >✕</button>
                  </div>
                  <p className="mt-1 truncate text-[11px] text-app-subtle" title={p.name}>{p.name}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-3">
              <Button onClick={upload} loading={uploading} className="px-4 py-2.5">Unggah {pending.length} gambar</Button>
              <Button
                variant="ghost"
                onClick={() => { for (const p of pending) URL.revokeObjectURL(p.preview); setPending([]); }}
                className="px-4 py-2.5"
              >Kosongkan</Button>
            </div>
          </div>
        )}
      </Card>

      {loading ? (
        <LoadingSkeleton rows={3} />
      ) : error ? (
        <Card><p className="text-sm font-bold text-danger-600 dark:text-danger-400">{error}</p></Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon="🖼️"
          title="Belum ada foto profil"
          description="Unggah gambar pertama di atas. Avatar default toko tetap tersedia sebagai cadangan."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a, i) => (
            <Card key={a.id} className="min-w-0">
              <div className="flex items-start gap-3">
                <UserAvatar size={64} src={a.image_url} name={a.label || "Avatar"} ring={a.is_active} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-black text-app-text">{a.label || "(tanpa label)"}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {a.is_default ? <Badge tone="gold">Default</Badge> : null}
                    <Badge tone={a.is_active ? "success" : "neutral"}>{a.is_active ? "Aktif" : "Nonaktif"}</Badge>
                    <span className="text-[11px] font-bold text-app-subtle">{a.usage_count} pengguna</span>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === a.id || a.is_default}
                  onClick={() => patch(a.id, { is_active: !a.is_active })}
                >{a.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>
                <Button variant="ghost" size="sm" disabled={busyId === a.id || i === 0} onClick={() => patch(a.id, { move: "up" })} aria-label="Naikkan urutan">▲</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busyId === a.id || i === items.length - 1}
                  onClick={() => patch(a.id, { move: "down" })}
                  aria-label="Turunkan urutan"
                >▼</Button>
                {!a.is_default && (
                  <Button variant="destructive" size="sm" disabled={busyId === a.id} onClick={() => setConfirmDelete(a)}>Hapus</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi hapus avatar"
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div className="w-full max-w-sm rounded-t-3xl border border-app-border bg-app-surface p-5 shadow-2xl sm:rounded-3xl">
            <h2 className="text-base font-black text-app-text">Hapus foto profil ini?</h2>
            <div className="mt-3 flex items-center gap-3">
              <UserAvatar size={48} src={confirmDelete.image_url} name={confirmDelete.label || "Avatar"} />
              <p className="min-w-0 break-words text-sm text-app-muted">
                {confirmDelete.usage_count > 0
                  ? `${confirmDelete.usage_count} pengguna saat ini memakainya. Mereka otomatis kembali ke avatar default.`
                  : "Belum ada pengguna yang memakai avatar ini."}
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <Button variant="outline" onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5">Batal</Button>
              <Button variant="destructive" onClick={() => remove(confirmDelete)} loading={busyId === confirmDelete.id} className="flex-1 py-2.5">Hapus</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
