"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Badge, { statusTone } from "@/components/ui/Badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import LoadingSkeleton from "@/components/ui/LoadingSkeleton";
import Icon from "@/components/icons/Icon";
import { useToast } from "@/components/ToastProvider";
import { formatDate, formatRupiah } from "@/lib/utils";

type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

type ManualRequest = {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  channel_id: string | null;
  channel_type: string;
  channel_name: string;
  account_number: string | null;
  account_holder_name: string | null;
  amount: number;
  proof_url: string | null;
  status: string;
  admin_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type Counts = Record<RequestStatus, number>;

const TABS: { value: RequestStatus; label: string }[] = [
  { value: "PENDING", label: "Menunggu" },
  { value: "APPROVED", label: "Disetujui" },
  { value: "REJECTED", label: "Ditolak" },
];

const REQUEST_STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu konfirmasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

const EMPTY_COUNTS: Counts = { PENDING: 0, APPROVED: 0, REJECTED: 0 };

export default function AdminManualTopupRequestsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<RequestStatus>("PENDING");
  const [requests, setRequests] = useState<ManualRequest[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ManualRequest | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<{ url: string; name: string } | null>(null);

  async function load(status: RequestStatus) {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/admin/manual-topup/requests?status=${status}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setLoadError(String(json?.message || "Gagal memuat permintaan Top Up Manual."));
        setRequests([]);
        return;
      }
      setRequests(Array.isArray(json?.requests) ? json.requests : []);
      setCounts({
        PENDING: Number(json?.counts?.PENDING || 0),
        APPROVED: Number(json?.counts?.APPROVED || 0),
        REJECTED: Number(json?.counts?.REJECTED || 0),
      });
    } catch {
      setLoadError("Koneksi bermasalah. Periksa internet Anda lalu coba lagi.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab);
  }, [tab]);

  useEffect(() => {
    if (!proofPreview) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProofPreview(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [proofPreview]);

  async function approve(request: ManualRequest) {
    const ok = confirm(
      `Setujui Top Up Manual sebesar ${formatRupiah(request.amount)} dari ${request.user_name}? Saldo pengguna akan langsung bertambah.`
    );
    if (!ok) return;
    setActingId(request.id);
    try {
      const response = await fetch(`/api/admin/manual-topup/requests/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        toast.show(String(json?.message || "Gagal menyetujui permintaan."), "error");
        return;
      }
      toast.show("Top Up Manual disetujui dan saldo pengguna sudah ditambahkan.", "success");
      await load(tab);
    } catch {
      toast.show("Koneksi bermasalah. Periksa internet Anda lalu coba lagi.", "error");
    } finally {
      setActingId(null);
    }
  }

  function openReject(request: ManualRequest) {
    setRejecting(request);
    setNote("");
    setNoteError(null);
  }

  async function submitReject() {
    if (!rejecting) return;
    if (note.trim().length < 5) {
      setNoteError("Alasan penolakan wajib diisi minimal 5 karakter.");
      return;
    }
    setActingId(rejecting.id);
    try {
      const response = await fetch(`/api/admin/manual-topup/requests/${rejecting.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", note: note.trim() }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        setNoteError(String(json?.message || "Gagal menolak permintaan."));
        return;
      }
      toast.show("Permintaan Top Up Manual ditolak. Alasan sudah dikirim ke pengguna.", "success");
      setRejecting(null);
      setNote("");
      await load(tab);
    } catch {
      setNoteError("Koneksi bermasalah. Periksa internet Anda lalu coba lagi.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="animate-page-in space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Keuangan</p>
          <h1 className="mt-2 text-2xl font-black text-app-text sm:text-3xl">Permintaan Top Up Manual</h1>
          <p className="mt-1 text-sm text-app-muted">
            Periksa bukti transfer lalu setujui untuk menambah saldo pengguna, atau tolak dengan alasan yang jelas.
          </p>
        </div>
        <Link
          href="/admin/manual-topup/channels"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-app-border bg-transparent px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft"
        >
          <Icon name="settings" size={16} />Kelola Channel &amp; Nominal
        </Link>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter status permintaan">
        {TABS.map((item) => {
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.value)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                active
                  ? "border-gold-400 bg-gold-400/15 text-app-text"
                  : "border-app-border bg-app-surface text-app-muted hover:border-gold-400 hover:text-app-text"
              }`}
            >
              {item.label}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-black tabular-nums ${
                  active ? "bg-gold-400 text-zinc-950" : "bg-app-inset text-app-muted"
                }`}
              >
                {counts[item.value]}
              </span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center">
          <Button variant="outline" size="sm" onClick={() => load(tab)} disabled={loading}>
            ↻ Muat ulang
          </Button>
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton rows={4} />
      ) : loadError ? (
        <ErrorState title="Gagal memuat permintaan" description={loadError} onRetry={() => load(tab)} />
      ) : requests.length === 0 ? (
        <EmptyState
          icon="receipt"
          title={tab === "PENDING" ? "Tidak ada permintaan menunggu" : "Belum ada permintaan"}
          description={
            tab === "PENDING"
              ? "Permintaan Top Up Manual baru akan muncul di sini untuk diperiksa."
              : "Permintaan dengan status ini belum tersedia."
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Card key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-app-text">{request.user_name}</p>
                  <p className="mt-1 break-all text-xs text-app-muted">
                    {request.user_email || request.user_id} · {formatDate(request.created_at)}
                  </p>
                </div>
                <Badge tone={statusTone(request.status)} className="uppercase">
                  {REQUEST_STATUS_LABEL[request.status] || request.status}
                </Badge>
              </div>

              <div className="mt-3 grid gap-2 rounded-2xl bg-app-inset p-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-app-subtle">Nominal Top Up</p>
                  <p className="mt-1 text-lg font-black tabular-nums text-app-text">{formatRupiah(request.amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-app-subtle">Channel</p>
                  <p className="mt-1 font-bold text-app-text">{request.channel_name}</p>
                  <p className="mt-0.5 text-xs text-app-muted">{request.channel_type}</p>
                </div>
                <div>
                  <p className="text-xs text-app-subtle">Tujuan Transfer</p>
                  <p className="mt-1 font-bold tabular-nums text-app-text">{request.account_number || "QRIS"}</p>
                  <p className="mt-0.5 text-xs text-app-muted">
                    {request.account_holder_name || "Sesuai gambar QRIS"}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {request.proof_url ? (
                  <button
                    type="button"
                    onClick={() => setProofPreview({ url: request.proof_url as string, name: request.user_name })}
                    className="group flex items-center gap-3 rounded-2xl border border-app-border bg-app-surface p-2 text-left transition hover:border-gold-400"
                  >
                    <img
                      src={request.proof_url}
                      alt={`Bukti transfer ${request.user_name}`}
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                    <span className="inline-flex items-center gap-1.5 pr-2 text-xs font-bold text-app-kicker group-hover:underline">
                      Perbesar bukti <Icon name="arrow_right" size={14} />
                    </span>
                  </button>
                ) : (
                  <p className="rounded-xl border border-dashed border-app-border px-3 py-2 text-xs text-app-muted">
                    Bukti transfer tidak tersedia.
                  </p>
                )}

                {request.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    <Button onClick={() => approve(request)} loading={actingId === request.id}>
                      <Icon name="check" size={16} />Setujui
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => openReject(request)}
                      disabled={actingId === request.id}
                    >
                      <Icon name="close" size={16} />Tolak
                    </Button>
                  </div>
                ) : request.admin_note ? (
                  <div className="w-full rounded-2xl border border-app-border bg-app-inset p-3 text-sm">
                    <p className="text-xs font-bold uppercase tracking-widest text-app-subtle">Catatan admin</p>
                    <p className="mt-1 text-app-text">{request.admin_note}</p>
                    {request.reviewed_at && (
                      <p className="mt-1 text-xs text-app-muted">Diproses {formatDate(request.reviewed_at)}</p>
                    )}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {proofPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Bukti transfer"
          onClick={() => setProofPreview(null)}
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto" onClick={(event) => event.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-white">Bukti transfer — {proofPreview.name}</p>
              <button
                type="button"
                onClick={() => setProofPreview(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/20"
              >
                Tutup <Icon name="close" size={16} />
              </button>
            </div>
            <img
              src={proofPreview.url}
              alt={`Bukti transfer ${proofPreview.name}`}
              className="max-h-[80vh] w-full rounded-2xl bg-white object-contain"
            />
          </div>
        </div>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-manual-topup-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-app-border bg-app-surface p-5 shadow-xl">
            <h2 id="reject-manual-topup-title" className="text-lg font-black text-app-text">
              Tolak Top Up Manual
            </h2>
            <CardDescription>
              {rejecting.user_name} · {formatRupiah(rejecting.amount)}. Alasan penolakan wajib diisi dan akan
              ditampilkan ke pengguna.
            </CardDescription>
            <div className="mt-4">
              <label htmlFor="manual-topup-reject-note" className="mb-2 block text-sm font-bold text-app-text">
                Alasan penolakan
              </label>
              <textarea
                id="manual-topup-reject-note"
                autoFocus
                rows={4}
                maxLength={500}
                value={note}
                onChange={(event) => {
                  setNote(event.target.value);
                  if (noteError) setNoteError(null);
                }}
                placeholder="Contoh: Nominal transfer tidak sesuai dengan yang diajukan."
                className={`w-full rounded-xl border bg-app-inset px-4 py-3 text-sm text-app-text outline-none transition placeholder:text-app-subtle/60 focus:ring-4 ${
                  noteError
                    ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/20"
                    : "border-app-border focus:border-gold-400 focus:ring-gold-400/20"
                }`}
              />
              {noteError ? (
                <p role="alert" className="mt-1.5 text-xs font-medium text-danger-600 dark:text-danger-400">
                  {noteError}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-app-subtle">Minimal 5 karakter, maksimal 500 karakter.</p>
              )}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRejecting(null);
                  setNote("");
                  setNoteError(null);
                }}
                disabled={actingId === rejecting.id}
              >
                Batal
              </Button>
              <Button
                variant="destructive"
                onClick={submitReject}
                loading={actingId === rejecting.id}
                disabled={actingId === rejecting.id}
              >
                Tolak Permintaan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
