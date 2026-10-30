"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ToastProvider";
import Badge, { statusTone } from "@/components/ui/Badge";
import { formatDate, formatRupiah } from "@/lib/utils";
import {
  MANUAL_PROOF_MAX_BYTES,
  MANUAL_PROOF_MIME_TYPES,
  MANUAL_TOPUP_CHANNEL_ICONS,
  isManualChannelType,
} from "@/lib/manual-topup";

type Channel = {
  id: string;
  channel_type: string;
  display_name: string;
  account_number: string | null;
  account_holder_name: string | null;
  qris_image_url: string | null;
  instructions: string | null;
  sort_order: number;
};

type Settings = {
  enabled: boolean;
  min_amount: number;
  max_amount: number;
};

type HistoryItem = {
  id: string;
  channel_type: string;
  channel_name: string;
  account_number: string | null;
  amount: number;
  status: string;
  admin_note: string | null;
  proof_url: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000, 1000000, 2000000];
const DEFAULT_SETTINGS: Settings = { enabled: false, min_amount: 10000, max_amount: 5000000 };

function channelIcon(type: string) {
  return isManualChannelType(type) ? MANUAL_TOPUP_CHANNEL_ICONS[type] : "LN";
}

function statusText(status: string) {
  if (status === "APPROVED") return "Berhasil";
  if (status === "REJECTED") return "Ditolak";
  return "Menunggu konfirmasi";
}

export default function ManualTopupForm() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [channelId, setChannelId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedChannel = useMemo(
    () => channels.find((channel) => channel.id === channelId) || null,
    [channels, channelId]
  );
  const amount = Number(amountText || 0);
  const pendingRequest = history.find((item) => item.status === "PENDING") || null;

  const quickAmounts = useMemo(() => {
    const { min_amount, max_amount } = settings;
    const values = QUICK_AMOUNTS.filter((value) => value >= min_amount && value <= max_amount);
    return values.length > 0 ? values : [min_amount];
  }, [settings]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/topup/manual/history", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (response.ok) setHistory(json?.requests || []);
    } catch {
      // Riwayat bersifat pelengkap; kegagalan muat tidak menghalangi pengiriman.
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [channelResponse, historyResponse] = await Promise.all([
          fetch("/api/topup/manual/channels", { cache: "no-store" }),
          fetch("/api/topup/manual/history", { cache: "no-store" }),
        ]);
        const channelJson = await channelResponse.json().catch(() => null);
        const historyJson = await historyResponse.json().catch(() => null);
        if (cancelled) return;

        if (!channelResponse.ok) {
          setLoadError(String(channelJson?.message || "Top Up Manual belum tersedia. Silakan hubungi admin."));
        } else {
          const nextChannels: Channel[] = channelJson?.channels || [];
          setChannels(nextChannels);
          setSettings({
            enabled: Boolean(channelJson?.enabled),
            min_amount: Number(channelJson?.min_amount || 10000),
            max_amount: Number(channelJson?.max_amount || 5000000),
          });
          setChannelId((previous) =>
            nextChannels.some((channel) => channel.id === previous)
              ? previous
              : nextChannels[0]?.id || ""
          );
        }

        if (historyResponse.ok) setHistory(historyJson?.requests || []);
      } catch {
        if (!cancelled) setLoadError("Koneksi bermasalah. Periksa internet Anda lalu coba lagi.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseProof(file: File | null) {
    if (!file) {
      setProof(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    if (!(MANUAL_PROOF_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.show("Format bukti transfer harus JPG, PNG, atau WEBP.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MANUAL_PROOF_MAX_BYTES) {
      toast.show("Ukuran bukti transfer maksimal 5MB. Kompres file lalu coba lagi.", "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setProof(file);
    setPreviewUrl(URL.createObjectURL(file));
    setFormError(null);
  }

  async function copyAccount() {
    if (!selectedChannel?.account_number) return;
    try {
      await navigator.clipboard.writeText(selectedChannel.account_number);
      toast.show("Nomor tujuan berhasil disalin.", "success");
    } catch {
      toast.show("Gagal menyalin otomatis. Silakan salin nomor secara manual.", "error");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!settings.enabled) {
      setFormError("Top Up Manual sedang dinonaktifkan oleh admin.");
      return;
    }
    if (!selectedChannel) {
      setFormError("Pilih metode pembayaran terlebih dahulu.");
      return;
    }
    if (!Number.isInteger(amount) || amount <= 0) {
      setFormError("Isi nominal Top Up yang valid.");
      return;
    }
    if (amount < settings.min_amount) {
      setFormError(`Minimal Top Up Manual ${formatRupiah(settings.min_amount)}.`);
      return;
    }
    if (amount > settings.max_amount) {
      setFormError(`Maksimal Top Up Manual ${formatRupiah(settings.max_amount)}.`);
      return;
    }
    if (!proof) {
      setFormError("Unggah bukti transfer terlebih dahulu.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("channel_id", selectedChannel.id);
      formData.append("amount", String(amount));
      formData.append("proof", proof);

      const response = await fetch("/api/topup/manual/request", {
        method: "POST",
        body: formData,
      });
      const json = await response.json().catch(() => null);

      if (!response.ok) {
        const message = String(json?.message || "Permintaan Top Up Manual gagal dikirim. Silakan coba lagi.");
        setFormError(message);
        toast.show(message, "error");
        return;
      }

      toast.show(
        "Permintaan Top Up Manual berhasil dikirim. Menunggu konfirmasi admin maksimal 1x24 jam.",
        "success"
      );
      setAmountText("");
      setProof(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadHistory();
    } catch {
      const message = "Koneksi bermasalah. Permintaan mungkin belum terkirim — periksa riwayat sebelum mengirim ulang.";
      setFormError(message);
      toast.show(message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[480px] animate-pulse space-y-3 pb-6" aria-busy="true">
        <div className="h-20 rounded-3xl border border-app-border bg-app-surface" />
        <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 rounded-xl bg-app-inset" />)}</div>
        <div className="h-28 rounded-3xl border border-app-border bg-app-surface" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-[480px] rounded-2xl border border-danger-500/30 bg-danger-500/10 p-5 text-sm font-bold text-danger-600 dark:text-danger-400">
        {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px] space-y-4">
      <div className="overflow-hidden rounded-3xl border border-app-border bg-app-surface">
        <div className="border-b border-app-border p-6">
          <h1 className="text-2xl font-black text-app-text">Top Up Manual</h1>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            Bayar sesuai nomor tujuan di bawah, lalu unggah bukti transfer. Admin memverifikasi
            maksimal 1x24 jam.
          </p>
        </div>

        {!settings.enabled ? (
          <div className="p-6">
            <p role="alert" className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4 text-sm font-bold text-warning-700 dark:text-warning-300">
              Top Up Manual sedang dinonaktifkan oleh admin. Silakan gunakan Top Up Otomatis.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="p-5 sm:p-7">
              <p className="font-black text-app-text">1. Pilih metode pembayaran</p>
              {channels.length === 0 ? (
                <p className="mt-3 rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-muted">
                  Belum ada metode pembayaran manual yang aktif. Silakan hubungi admin.
                </p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {channels.map((channel) => {
                    const active = channel.id === channelId;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => {
                          setChannelId(channel.id);
                          setFormError(null);
                        }}
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                          active
                            ? "border-gold-400 bg-app-accent-soft"
                            : "border-app-border bg-app-inset hover:border-gold-400/50"
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-xs font-black text-gold-400">
                          {channelIcon(channel.channel_type)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-black text-app-text">{channel.display_name}</span>
                          <span className="block truncate text-xs text-app-subtle">
                            {channel.channel_type === "QRIS"
                              ? "Pindai kode QRIS di bawah"
                              : channel.account_number || "Nomor belum diisi"}
                          </span>
                        </span>
                        <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${active ? "border-gold-400 bg-gold-400" : "border-app-border"}`} aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedChannel && (
                <div className="mt-3 rounded-2xl border border-app-border bg-app-inset/60 p-4">
                  {selectedChannel.channel_type === "QRIS" ? (
                    <div className="text-center">
                      <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Pindai QRIS</p>
                      {selectedChannel.qris_image_url ? (
                        <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-3">
                          <img
                            src={selectedChannel.qris_image_url}
                            alt={`QRIS ${selectedChannel.display_name}`}
                            className="h-auto w-64 max-w-full"
                          />
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-danger-600 dark:text-danger-400">Gambar QRIS belum tersedia.</p>
                      )}
                      <p className="mt-3 text-xs text-app-subtle">
                        Pindai dengan aplikasi pembayaran yang mendukung QRIS, lalu unggah bukti.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-app-subtle">Nomor tujuan</p>
                      <p className="mt-1 break-all text-xl font-black tabular-nums tracking-wider text-app-text">
                        {selectedChannel.account_number || "-"}
                      </p>
                      <p className="mt-1 text-sm text-app-muted">
                        Atas nama: {selectedChannel.account_holder_name || "-"}
                      </p>
                      {selectedChannel.account_number && (
                        <button
                          type="button"
                          onClick={copyAccount}
                          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-app-border px-4 py-2 text-sm font-bold text-app-text transition hover:border-gold-400/60 hover:text-app-kicker"
                        >
                          Salin Nomor Tujuan
                        </button>
                      )}
                    </div>
                  )}
                  {selectedChannel.instructions && (
                    <p className="mt-3 whitespace-pre-line border-t border-app-border pt-3 text-xs leading-5 text-app-muted">
                      {selectedChannel.instructions}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-app-border p-5 sm:p-7">
              <p className="font-black text-app-text">2. Masukkan nominal</p>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {quickAmounts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setAmountText(String(value));
                      setFormError(null);
                    }}
                    className={`flex min-h-[44px] items-center justify-center rounded-xl border px-2 py-2 text-xs font-black tabular-nums transition ${
                      amount === value
                        ? "border-gold-400 bg-app-accent-soft text-app-kicker"
                        : "border-app-border bg-app-inset text-app-text hover:border-gold-400/50"
                    }`}
                  >
                    {formatRupiah(value)}
                  </button>
                ))}
              </div>
              <input
                value={amountText}
                onChange={(event) => {
                  setAmountText(event.target.value.replace(/\D/g, ""));
                  setFormError(null);
                }}
                inputMode="numeric"
                placeholder="Nominal lainnya"
                aria-label="Nominal Top Up Manual"
                className="mt-3 w-full rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle focus:border-gold-400 focus:ring-4 focus:ring-gold-400/20"
              />
              <p className="mt-2 text-xs text-app-subtle">
                Minimal {formatRupiah(settings.min_amount)} · Maksimal {formatRupiah(settings.max_amount)}.
              </p>
            </div>

            <div className="border-t border-app-border p-5 sm:p-7">
              <p className="font-black text-app-text">3. Unggah bukti transfer</p>
              <input
                ref={fileRef}
                id={fileInputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => chooseProof(event.target.files?.[0] || null)}
                className="sr-only"
                aria-label="Bukti transfer"
              />
              <label
                htmlFor={fileInputId}
                className="mt-3 flex min-h-[88px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-app-border bg-app-inset px-4 py-4 text-center transition hover:border-gold-400/60"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Pratinjau bukti transfer" className="max-h-48 rounded-xl object-contain" />
                ) : (
                  <>
                    <span className="text-sm font-black text-app-text">Pilih gambar bukti transfer</span>
                    <span className="mt-1 text-xs text-app-subtle">JPG, PNG, atau WEBP · maksimal 5MB</span>
                  </>
                )}
              </label>
              {proof && (
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-app-muted">{proof.name}</span>
                  <button
                    type="button"
                    onClick={() => chooseProof(null)}
                    className="shrink-0 font-bold text-danger-600 hover:underline dark:text-danger-400"
                  >
                    Hapus
                  </button>
                </div>
              )}
            </div>

            {formError && (
              <div className="px-5 pb-1 sm:px-7">
                <p role="alert" className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm font-bold text-danger-600 dark:text-danger-400">
                  {formError}
                </p>
              </div>
            )}

            <div className="p-5 sm:p-7">
              <button
                type="submit"
                disabled={submitting || channels.length === 0}
                className="btn-gold inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-950/30 border-t-zinc-950" />}
                Kirim Konfirmasi Top Up
              </button>
              <p className="mt-2 text-center text-xs text-app-subtle">
                Pastikan nominal dan bukti transfer sesuai. Permintaan yang sudah dikirim tidak dapat dibatalkan.
              </p>
            </div>
          </form>
        )}
      </div>

      {pendingRequest && (
        <div className="rounded-2xl border border-warning-500/30 bg-warning-500/10 p-4">
          <p className="text-sm font-black text-warning-700 dark:text-warning-300">
            Menunggu konfirmasi admin (maksimal 1x24 jam)
          </p>
          <p className="mt-1 text-sm text-app-muted">
            Permintaan {formatRupiah(pendingRequest.amount)} via {pendingRequest.channel_name} sedang diverifikasi.
          </p>
        </div>
      )}

      <div className="rounded-3xl border border-app-border bg-app-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-black text-app-text">Riwayat Top Up Manual</h2>
          <button
            type="button"
            onClick={loadHistory}
            disabled={historyLoading}
            className="text-xs font-bold text-app-kicker transition hover:underline disabled:opacity-60"
          >
            {historyLoading ? "Memuat..." : "Muat ulang"}
          </button>
        </div>

        {history.length === 0 ? (
          <p className="mt-3 rounded-xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-muted">
            Belum ada permintaan Top Up Manual.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {history.map((item) => (
              <div key={item.id} className="rounded-2xl border border-app-border bg-app-inset p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-app-text">{item.channel_name}</p>
                    <p className="text-xs text-app-subtle">
                      {formatDate(item.created_at)} · {item.channel_type}
                    </p>
                  </div>
                  <Badge tone={statusTone(item.status)}>{statusText(item.status)}</Badge>
                </div>
                <p className="mt-2 text-lg font-black tabular-nums text-app-text">{formatRupiah(item.amount)}</p>
                {item.status === "REJECTED" && item.admin_note && (
                  <p className="mt-2 rounded-xl border border-danger-500/25 bg-danger-500/10 px-3 py-2 text-xs leading-5 text-danger-600 dark:text-danger-400">
                    Alasan penolakan: {item.admin_note}
                  </p>
                )}
                {item.status === "APPROVED" && item.admin_note && (
                  <p className="mt-2 text-xs leading-5 text-app-muted">Catatan admin: {item.admin_note}</p>
                )}
                {item.proof_url && (
                  <a
                    href={item.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-bold text-app-kicker hover:underline"
                  >
                    Lihat bukti transfer
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
