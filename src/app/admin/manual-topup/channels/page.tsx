"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import EmptyState from "@/components/ui/EmptyState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import { useToast } from "@/components/ToastProvider";
import { formatRupiah } from "@/lib/utils";
import {
  MANUAL_PROOF_MAX_BYTES,
  MANUAL_PROOF_MIME_TYPES,
  MANUAL_TOPUP_CHANNEL_LABELS,
  MANUAL_TOPUP_CHANNEL_TYPES,
  isManualChannelType,
  type ManualTopupChannelType,
} from "@/lib/manual-topup";

type Channel = {
  id: string;
  channel_type: string;
  display_name: string;
  account_number: string | null;
  account_holder_name: string | null;
  qris_image_url: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
  updated_at: string | null;
};

type Settings = {
  is_enabled: boolean;
  min_amount: number;
  max_amount: number;
  updated_at: string | null;
};

type FormState = {
  channel_type: ManualTopupChannelType;
  display_name: string;
  account_number: string;
  account_holder_name: string;
  instructions: string;
  qris_image_url: string;
  is_active: boolean;
  sort_order: string;
};

const EMPTY_FORM: FormState = {
  channel_type: "DANA",
  display_name: MANUAL_TOPUP_CHANNEL_LABELS.DANA,
  account_number: "",
  account_holder_name: "",
  instructions: "",
  qris_image_url: "",
  is_active: true,
  sort_order: "0",
};

function channelInitial(type: string) {
  return isManualChannelType(type) ? MANUAL_TOPUP_CHANNEL_LABELS[type].slice(0, 2).toUpperCase() : "LN";
}

export default function AdminManualTopupChannelsPage() {
  const toast = useToast();
  const qrisInputId = useId();
  const qrisInputRef = useRef<HTMLInputElement>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [qrisPreview, setQrisPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin/manual-topup/channels", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setLoadError(String(json?.message || "Gagal memuat channel Top Up Manual."));
        return;
      }
      setChannels(json?.channels || []);
      setSettings(json?.settings || null);
    } catch {
      setLoadError("Koneksi bermasalah. Periksa internet Anda lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    return () => {
      if (qrisPreview) URL.revokeObjectURL(qrisPreview);
    };
  }, [qrisPreview]);

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setQrisFile(null);
    if (qrisPreview) URL.revokeObjectURL(qrisPreview);
    setQrisPreview(null);
    if (qrisInputRef.current) qrisInputRef.current.value = "";
  }

  function changeType(type: ManualTopupChannelType) {
    setForm((previous) => ({
      ...previous,
      channel_type: type,
      display_name:
        previous.display_name.trim() === "" ||
        previous.display_name === MANUAL_TOPUP_CHANNEL_LABELS[previous.channel_type]
          ? MANUAL_TOPUP_CHANNEL_LABELS[type]
          : previous.display_name,
      account_number: type === "QRIS" ? "" : previous.account_number,
    }));
  }

  function chooseQris(file: File | null) {
    if (!file) {
      setQrisFile(null);
      if (qrisPreview) URL.revokeObjectURL(qrisPreview);
      setQrisPreview(null);
      return;
    }
    if (!(MANUAL_PROOF_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.show("Format gambar QRIS harus JPG, PNG, atau WEBP.", "error");
      if (qrisInputRef.current) qrisInputRef.current.value = "";
      return;
    }
    if (file.size > MANUAL_PROOF_MAX_BYTES) {
      toast.show("Ukuran gambar QRIS maksimal 5MB.", "error");
      if (qrisInputRef.current) qrisInputRef.current.value = "";
      return;
    }
    if (qrisPreview) URL.revokeObjectURL(qrisPreview);
    setQrisFile(file);
    setQrisPreview(URL.createObjectURL(file));
  }

  function editChannel(channel: Channel) {
    const type = isManualChannelType(channel.channel_type) ? channel.channel_type : "LAINNYA";
    setEditingId(channel.id);
    setForm({
      channel_type: type,
      display_name: channel.display_name,
      account_number: channel.account_number || "",
      account_holder_name: channel.account_holder_name || "",
      instructions: channel.instructions || "",
      qris_image_url: channel.qris_image_url || "",
      is_active: channel.is_active,
      sort_order: String(channel.sort_order ?? 0),
    });
    setQrisFile(null);
    if (qrisPreview) URL.revokeObjectURL(qrisPreview);
    setQrisPreview(null);
    if (qrisInputRef.current) qrisInputRef.current.value = "";
  }

  async function saveChannel(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;

    if (form.display_name.trim().length < 2) {
      toast.show("Nama channel minimal 2 karakter.", "error");
      return;
    }
    if (form.channel_type !== "QRIS" && !form.account_number.trim()) {
      toast.show("Nomor rekening / akun wajib diisi.", "error");
      return;
    }
    if (form.channel_type === "QRIS" && !qrisFile && !form.qris_image_url) {
      toast.show("Gambar QRIS wajib diunggah untuk channel QRIS.", "error");
      return;
    }

    setSaving(true);
    try {
      let qrisUrl = form.qris_image_url;
      if (form.channel_type === "QRIS" && qrisFile) {
        const uploadForm = new FormData();
        uploadForm.append("file", qrisFile);
        const upload = await fetch("/api/admin/manual-topup/qris", { method: "POST", body: uploadForm });
        const uploadJson = await upload.json().catch(() => null);
        if (!upload.ok) {
          toast.show(String(uploadJson?.message || "Gagal mengunggah gambar QRIS."), "error");
          return;
        }
        qrisUrl = String(uploadJson?.url || "");
      }

      const payload = {
        channel_type: form.channel_type,
        display_name: form.display_name.trim(),
        account_number: form.channel_type === "QRIS" ? null : form.account_number.trim(),
        account_holder_name: form.account_holder_name.trim() || null,
        qris_image_url: form.channel_type === "QRIS" ? qrisUrl : null,
        instructions: form.instructions.trim() || null,
        is_active: form.is_active,
        sort_order: Number(form.sort_order) || 0,
      };

      const response = await fetch("/api/admin/manual-topup/channels", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        toast.show(String(json?.message || "Gagal menyimpan channel."), "error");
        return;
      }

      toast.show(editingId ? "Channel berhasil diperbarui." : "Channel berhasil ditambahkan.", "success");
      resetForm();
      await load();
    } catch {
      toast.show("Koneksi bermasalah. Silakan coba lagi.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleChannel(channel: Channel) {
    setBusyId(channel.id);
    try {
      const response = await fetch("/api/admin/manual-topup/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: channel.id, is_active: !channel.is_active }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        toast.show(String(json?.message || "Gagal mengubah status channel."), "error");
        return;
      }
      toast.show(channel.is_active ? "Channel dinonaktifkan." : "Channel diaktifkan.", "success");
      await load();
    } catch {
      toast.show("Koneksi bermasalah. Silakan coba lagi.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteChannel(channel: Channel) {
    if (!confirm(`Hapus channel ${channel.display_name}? Riwayat permintaan lama tetap tersimpan.`)) return;
    setBusyId(channel.id);
    try {
      const response = await fetch(`/api/admin/manual-topup/channels?id=${encodeURIComponent(channel.id)}`, {
        method: "DELETE",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        toast.show(String(json?.message || "Gagal menghapus channel."), "error");
        return;
      }
      toast.show("Channel dihapus.", "success");
      if (editingId === channel.id) resetForm();
      await load();
    } catch {
      toast.show("Koneksi bermasalah. Silakan coba lagi.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || savingSettings) return;
    if (!Number.isInteger(settings.min_amount) || settings.min_amount <= 0) {
      toast.show("Nominal minimum harus bilangan bulat positif.", "error");
      return;
    }
    if (!Number.isInteger(settings.max_amount) || settings.max_amount < settings.min_amount) {
      toast.show("Nominal maksimum harus bilangan bulat dan tidak kurang dari minimum.", "error");
      return;
    }
    setSavingSettings(true);
    try {
      const response = await fetch("/api/admin/manual-topup/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        toast.show(String(json?.message || "Gagal menyimpan pengaturan."), "error");
        return;
      }
      setSettings(json.settings);
      toast.show("Pengaturan Top Up Manual tersimpan.", "success");
    } catch {
      toast.show("Koneksi bermasalah. Silakan coba lagi.", "error");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Keuangan</p>
          <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Channel Top Up Manual</h1>
          <p className="mt-1 max-w-2xl text-sm text-app-muted">
            Atur rekening/akun tujuan dan QRIS yang ditampilkan ke pelanggan. Perubahan tercatat di audit log.
          </p>
        </div>
        <Link
          href="/admin/manual-topup/requests"
          className="inline-flex min-h-[44px] items-center rounded-xl border border-app-border px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:text-app-kicker"
        >
          Permintaan Masuk
        </Link>
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} />
      ) : loadError ? (
        <div className="rounded-2xl border border-danger-500/30 bg-danger-500/10 p-4 text-sm font-bold text-danger-600 dark:text-danger-400">
          {loadError}
        </div>
      ) : (
        <>
          <Card>
            <CardTitle>Pengaturan Top Up Manual</CardTitle>
            <CardDescription>
              Saat dinonaktifkan, pilihan Top Up Manual disembunyikan dan permintaan baru ditolak.
            </CardDescription>
            {settings ? (
              <form onSubmit={saveSettings} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <Input
                  label="Nominal minimum (Rp)"
                  type="number"
                  min="1"
                  required
                  value={settings.min_amount}
                  onChange={(event) =>
                    setSettings({ ...settings, min_amount: Number(event.target.value) })
                  }
                  className="bg-app-inset"
                />
                <Input
                  label="Nominal maksimum (Rp)"
                  type="number"
                  min="1"
                  required
                  value={settings.max_amount}
                  onChange={(event) =>
                    setSettings({ ...settings, max_amount: Number(event.target.value) })
                  }
                  className="bg-app-inset"
                />
                <Button type="submit" loading={savingSettings}>
                  Simpan Pengaturan
                </Button>
                <label className="flex items-center gap-2 text-sm font-bold text-app-text sm:col-span-3">
                  <input
                    type="checkbox"
                    checked={settings.is_enabled}
                    onChange={(event) => setSettings({ ...settings, is_enabled: event.target.checked })}
                    className="h-4 w-4 accent-gold-400"
                  />
                  Aktifkan Top Up Manual
                </label>
                <p className="text-xs text-app-subtle sm:col-span-3">
                  Batas saat ini: {formatRupiah(settings.min_amount)} – {formatRupiah(settings.max_amount)}.
                </p>
              </form>
            ) : (
              <p className="mt-3 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3 text-sm font-bold text-warning-700 dark:text-warning-300">
                Pengaturan belum tersedia. Pastikan migrasi v93 sudah dijalankan.
              </p>
            )}
          </Card>

          <Card>
            <CardTitle>{editingId ? "Edit Channel" : "Tambah Channel"}</CardTitle>
            <CardDescription>
              Channel QRIS wajib memiliki gambar. Channel lain wajib memiliki nomor rekening/akun tujuan.
            </CardDescription>
            <form onSubmit={saveChannel} className="mt-4 grid gap-3 sm:grid-cols-2">
              <Select
                label="Jenis channel"
                value={form.channel_type}
                onChange={(event) => changeType(event.target.value as ManualTopupChannelType)}
                className="bg-app-inset"
              >
                {MANUAL_TOPUP_CHANNEL_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MANUAL_TOPUP_CHANNEL_LABELS[type]}
                  </option>
                ))}
              </Select>
              <Input
                label="Nama tampilan"
                required
                value={form.display_name}
                onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                placeholder="Contoh: DANA Utama"
                className="bg-app-inset"
              />

              {form.channel_type === "QRIS" ? (
                <div className="sm:col-span-2">
                  <p className="mb-2 block text-sm font-bold text-app-text">Gambar QRIS</p>
                  <input
                    ref={qrisInputRef}
                    id={qrisInputId}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => chooseQris(event.target.files?.[0] || null)}
                    className="sr-only"
                  />
                  <div className="flex flex-wrap items-start gap-3">
                    <label
                      htmlFor={qrisInputId}
                      className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-app-border bg-app-inset px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:text-app-kicker"
                    >
                      {qrisFile ? "Ganti Gambar QRIS" : "Pilih Gambar QRIS"}
                    </label>
                    {qrisPreview || form.qris_image_url ? (
                      <div className="rounded-xl bg-white p-2">
                        <img
                          src={qrisPreview || form.qris_image_url}
                          alt="Pratinjau QRIS"
                          className="h-32 w-32 object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-app-subtle">Belum ada gambar. JPG/PNG/WEBP maksimal 5MB.</p>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <Input
                    label="Nomor rekening / akun"
                    required
                    value={form.account_number}
                    onChange={(event) => setForm({ ...form, account_number: event.target.value })}
                    placeholder="Contoh: 0812xxxx atau 1234567890"
                    className="bg-app-inset"
                  />
                  <Input
                    label="Nama pemilik rekening/akun"
                    value={form.account_holder_name}
                    onChange={(event) => setForm({ ...form, account_holder_name: event.target.value })}
                    placeholder="Contoh: Nama Pemilik"
                    className="bg-app-inset"
                  />
                </>
              )}

              <div className="sm:col-span-2">
                <p className="mb-2 block text-sm font-bold text-app-text">Instruksi untuk pelanggan (opsional)</p>
                <textarea
                  rows={3}
                  value={form.instructions}
                  onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                  placeholder="Contoh: Transfer sesuai nominal, lalu unggah bukti transfer."
                  className="w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
                />
              </div>

              <Input
                label="Urutan tampil"
                type="number"
                min="0"
                value={form.sort_order}
                onChange={(event) => setForm({ ...form, sort_order: event.target.value })}
                className="bg-app-inset"
                hint="Angka kecil tampil lebih dulu."
              />
              <label className="flex items-end gap-2 pb-3 text-sm font-bold text-app-text">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
                  className="h-4 w-4 accent-gold-400"
                />
                Channel aktif
              </label>

              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" loading={saving}>
                  {editingId ? "Simpan Perubahan" : "Tambah Channel"}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Batal Edit
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card>
            <CardTitle>Daftar Channel</CardTitle>
            <CardDescription>{channels.length} channel terdaftar.</CardDescription>
            {channels.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  icon="bank"
                  title="Belum ada channel manual"
                  description="Tambahkan minimal satu channel agar pelanggan dapat melakukan Top Up Manual."
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {channels.map((channel) => (
                  <div key={channel.id} className="rounded-2xl border border-app-border bg-app-inset p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-xs font-black text-gold-400">
                          {channelInitial(channel.channel_type)}
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-black text-app-text">
                            {channel.display_name}
                            <Badge tone={channel.is_active ? "success" : "neutral"} className="px-2 py-0.5">
                              {channel.is_active ? "Aktif" : "Nonaktif"}
                            </Badge>
                          </p>
                          <p className="mt-0.5 text-xs text-app-muted">
                            {channel.channel_type} · urutan {channel.sort_order}
                          </p>
                          <p className="mt-1 break-all text-sm text-app-text">
                            {channel.channel_type === "QRIS"
                              ? "Pembayaran via gambar QRIS"
                              : `${channel.account_number || "-"} · ${channel.account_holder_name || "tanpa nama"}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => editChannel(channel)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={channel.is_active ? "destructive" : "secondary"}
                          loading={busyId === channel.id}
                          onClick={() => toggleChannel(channel)}
                        >
                          {channel.is_active ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === channel.id}
                          onClick={() => deleteChannel(channel)}
                        >
                          Hapus
                        </Button>
                      </div>
                    </div>
                    {channel.channel_type === "QRIS" && channel.qris_image_url && (
                      <div className="mt-3 flex items-center gap-3">
                        <div className="rounded-lg bg-white p-1.5">
                          <img src={channel.qris_image_url} alt={`QRIS ${channel.display_name}`} className="h-20 w-20 object-contain" />
                        </div>
                        <a
                          href={channel.qris_image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-bold text-app-kicker hover:underline"
                        >
                          Buka gambar QRIS
                        </a>
                      </div>
                    )}
                    {channel.instructions && (
                      <p className="mt-3 whitespace-pre-line border-t border-app-border pt-3 text-xs leading-5 text-app-muted">
                        {channel.instructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
