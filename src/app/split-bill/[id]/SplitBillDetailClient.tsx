"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ToastProvider";
import { calcTransferFee, type TransferFeeType } from "@/lib/transfer/utils";
import {formatRupiah, formatDateOnly} from "@/lib/utils";
import Icon from "@/components/icons/Icon";

type Bill = {
  id: string;
  bill_number: string;
  title: string;
  total_amount: number;
  split_mode: "EQUAL" | "CUSTOM";
  status: "ACTIVE" | "COMPLETED";
  created_at: string;
  completed_at: string | null;
  creator_id: string;
  creator_name: string;
  is_creator: boolean;
};

type Participant = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  share_amount: number;
  status: "PENDING" | "PAID";
  paid_at: string | null;
  request_number: string;
  last_reminded_at: string | null;
  is_viewer: boolean;
};

type Detail = {
  bill: Bill;
  participants: Participant[];
  my_share: { share_amount: number; status: "PENDING" | "PAID"; request_number: string } | null;
  participant_count: number;
  paid_count: number;
  collected_amount: number;
};

type PayResult = {
  transfer_number: string | null;
  amount: number;
  fee: number;
  total: number;
  completed: boolean;
  creator_name: string | null;
  message: string;
};

type Settings = {
  enabled: boolean;
  fee_type: TransferFeeType;
  fee_value: number;
  balance: number;
};

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `spl-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs font-bold text-app-muted">{label}</span>
      <span className={`text-sm font-black ${strong ? "text-app-kicker" : "text-app-text"}`}>{value}</span>
    </div>
  );
}

export default function SplitBillDetailClient({ billId }: { billId: string }) {
  const toast = useToast();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");

  const [settings, setSettings] = useState<Settings | null>(null);
  const [pin, setPin] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState("");
  const [payResult, setPayResult] = useState<PayResult | null>(null);

  const [reminding, setReminding] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  // Key idempotensi stabil per percobaan: retry setelah gagal jaringan
  // memakai key yang sama sehingga saldo tidak berpindah dua kali.
  const idemRef = useRef<string>("");
  if (!idemRef.current) idemRef.current = newIdempotencyKey();

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/split-bills/${billId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.message || "Gagal memuat tagihan."); setDetail(null); return; }
      setDetail(json);
      setError("");
    } catch {
      setError("Gagal memuat tagihan. Periksa koneksi Anda.");
    }
  }, [billId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/transfer/settings");
        if (!res.ok) return;
        const json = await res.json();
        setSettings({ enabled: json.enabled, fee_type: json.fee_type, fee_value: Number(json.fee_value || 0), balance: Number(json.balance || 0) });
      } catch {
        // Perkiraan biaya bersifat opsional.
      }
    })();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const bill = detail?.bill;
  const myShare = detail?.my_share || null;
  const canPay = Boolean(bill && !bill.is_creator && myShare && myShare.status === "PENDING" && bill.status === "ACTIVE");
  const shareNumber = Number(myShare?.share_amount || 0);
  const feeEstimate = settings && canPay ? calcTransferFee(settings.fee_type, settings.fee_value, shareNumber) : 0;

  async function payMyShare(e: React.FormEvent) {
    e.preventDefault();
    setPayError("");
    if (!pin.trim()) { setPayError("Masukkan PIN transaksi."); return; }
    setPayBusy(true);
    try {
      const res = await fetch(`/api/split-bills/${billId}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), idempotency_key: idemRef.current }),
      });
      const json = await res.json();
      if (!res.ok) { setPayError(json.message || "Pembayaran gagal. Coba lagi."); return; }
      setPayResult(json);
      setPin("");
      idemRef.current = newIdempotencyKey();
      loadDetail();
    } catch {
      setPayError("Koneksi bermasalah. Pembayaran mungkin belum terkirim — tekan Bayar sekali lagi, sistem mencegah pembayaran ganda.");
    } finally {
      setPayBusy(false);
    }
  }

  async function remind(participant: Participant) {
    setReminding(participant.user_id);
    try {
      const res = await fetch(`/api/split-bills/${billId}/remind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_user_id: participant.user_id }),
      });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal mengirim pengingat.", "error"); return; }
      toast.show(`Pengingat terkirim ke ${participant.display_name}.`, "success");
      loadDetail();
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    } finally {
      setReminding(null);
    }
  }

  if (error && !detail) {
    return (
      <section className="rounded-3xl border border-danger-500/30 bg-danger-500/10 p-6">
        <p className="text-sm font-black text-danger-700 dark:text-danger-300">{error}</p>
        <Link href="/split-bill" className="mt-4 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white">Kembali ke daftar tagihan</Link>
      </section>
    );
  }

  if (!detail || !bill) {
    return <div className="animate-pulse rounded-3xl bg-app-inset p-6 text-sm text-app-muted">Memuat tagihan...</div>;
  }

  const progress = bill.total_amount > 0 ? Math.min(Math.round((detail.collected_amount / bill.total_amount) * 100), 100) : 0;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-app-text">{bill.title}</h2>
            <p className="mt-0.5 text-[11px] font-bold text-app-muted">{bill.bill_number} · Dibuat oleh {bill.is_creator ? "Anda" : bill.creator_name}</p>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black uppercase ${bill.status === "COMPLETED" ? "bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-300" : "bg-warning-500/10 text-warning-700 dark:text-warning-300"}`}>
            {bill.status === "COMPLETED" ? "Selesai" : "Aktif"}
          </span>
        </div>

        <div className="mt-4 divide-y divide-app-border rounded-2xl border border-app-border bg-app-inset px-4">
          <Row label="Total Tagihan" value={formatRupiah(bill.total_amount)} strong />
          <Row label="Sudah Terkumpul" value={formatRupiah(detail.collected_amount)} />
          <Row label="Peserta Membayar" value={`${detail.paid_count}/${detail.participant_count}`} />
          <Row label="Pembagian" value={bill.split_mode === "EQUAL" ? "Dibagi rata" : "Nominal custom"} />
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-app-inset">
          <div className="h-full rounded-full bg-gold-500" style={{ width: `${progress}%` }} />
        </div>

        {bill.status === "COMPLETED" && (
          <p className="mt-3 rounded-2xl border border-success-500/30 bg-success-500/10 p-3 text-xs font-bold text-success-700 dark:text-success-300">
            Semua peserta sudah membayar — tagihan otomatis ditandai SELESAI.
          </p>
        )}
      </section>

      {payResult && (
        <section className="rounded-3xl border border-success-500/30 bg-app-surface p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300"><Icon name="check_circle" size={24} /></span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-success-600 dark:text-success-400">Pembayaran Berhasil</p>
              <h2 className="text-xl font-black text-app-text">{payResult.message}</h2>
            </div>
          </div>
          <div className="mt-4 divide-y divide-app-border rounded-2xl border border-app-border bg-app-inset px-4">
            <Row label="No. Referensi" value={payResult.transfer_number || "-"} />
            <Row label="Nominal" value={formatRupiah(payResult.amount)} />
            <Row label="Biaya Admin" value={formatRupiah(payResult.fee || 0)} />
            <Row label="Total" value={formatRupiah(payResult.total ?? payResult.amount)} strong />
          </div>
          {payResult.completed && (
            <p className="mt-3 rounded-2xl border border-success-500/30 bg-success-500/10 p-3 text-xs font-bold text-success-700 dark:text-success-300">Semua peserta sudah membayar — tagihan ini selesai.</p>
          )}
          <button type="button" onClick={() => setPayResult(null)} className="mt-4 w-full rounded-2xl border border-app-border px-4 py-3 text-sm font-bold text-app-muted hover:bg-app-inset">Tutup</button>
        </section>
      )}

      {canPay && (
        <section className="rounded-3xl border border-gold-400/40 bg-app-surface p-5 shadow-sm sm:p-6">
          <h2 className="text-lg font-black text-app-text">Bayar Bagian Anda</h2>
          <p className="mt-1 text-sm text-app-muted">Saldo dikirim langsung ke {bill.creator_name} lewat transfer saldo dengan PIN transaksi.</p>

          <div className="mt-4 divide-y divide-app-border rounded-2xl border border-app-border bg-app-inset px-4">
            <Row label="Bagian Anda" value={formatRupiah(shareNumber)} strong />
            <Row label="Perkiraan Biaya Admin" value={feeEstimate > 0 ? formatRupiah(feeEstimate) : "Gratis"} />
            <Row label="Perkiraan Total" value={formatRupiah(shareNumber + feeEstimate)} />
            {settings && <Row label="Saldo Tersedia" value={formatRupiah(settings.balance)} />}
          </div>

          {settings && !settings.enabled && (
            <p className="mt-3 rounded-xl border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs font-bold text-warning-700 dark:text-warning-300">Transfer saldo sedang dinonaktifkan sementara — pembayaran tagihan tertunda.</p>
          )}
          {settings && shareNumber + feeEstimate > settings.balance && (
            <p className="mt-3 rounded-xl border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs font-bold text-danger-700 dark:text-danger-300">Saldo tidak mencukupi (termasuk biaya admin). Top up terlebih dahulu.</p>
          )}

          <form onSubmit={payMyShare} className="mt-4 space-y-3">
            <div>
              <label className="text-xs font-black uppercase tracking-wide text-app-muted">PIN Transaksi</label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                className="mt-2 w-full rounded-xl border border-app-border bg-app-inset px-3 py-2.5 text-center text-lg font-black tracking-[.4em] text-app-text outline-none placeholder:text-app-subtle focus:border-gold-400 focus:ring-2 focus:ring-gold-400/20"
              />
            </div>
            {payError && <p className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-3 py-2 text-xs font-bold text-danger-700 dark:text-danger-300">{payError}</p>}
            <button
              type="submit"
              disabled={payBusy || (settings ? !settings.enabled : false)}
              className="btn-gold inline-flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3.5 text-sm font-black disabled:opacity-50"
            >
              {payBusy ? "Memproses..." : <><Icon name="wallet" size={16} /> Bayar {formatRupiah(shareNumber)}</>}
            </button>
          </form>
        </section>
      )}

      {myShare && myShare.status === "PAID" && !bill.is_creator && (
        <section className="rounded-3xl border border-success-500/30 bg-success-500/10 p-5">
          <p className="text-sm font-black text-success-700 dark:text-success-300">Bagian Anda sudah dibayar. Terima kasih!</p>
          <p className="mt-1 text-xs font-bold text-success-700 dark:text-success-300">No. permintaan: {myShare.request_number}</p>
        </section>
      )}

      <section className="rounded-3xl border border-app-border bg-app-surface p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-app-text">Peserta ({detail.participant_count})</h2>
        <div className="mt-4 space-y-2">
          {detail.participants.map((p) => {
            const paid = p.status === "PAID";
            const cooldownEnd = p.last_reminded_at ? new Date(p.last_reminded_at).getTime() + REMINDER_COOLDOWN_MS : null;
            const cooldownLeft = cooldownEnd ? cooldownEnd - now : 0;
            return (
              <div key={p.user_id} className={`flex items-center gap-3 rounded-2xl border p-3 ${paid ? "border-success-500/30 bg-success-500/10" : "border-app-border bg-app-surface"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${paid ? "bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-slate-950 text-gold-200"}`}>
                  {paid ? <Icon name="check" size={18} /> : p.display_name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-app-text">
                    {p.display_name}{p.is_viewer ? " (Anda)" : ""}
                  </p>
                  <p className="text-[11px] font-bold text-app-muted">
                    {formatRupiah(p.share_amount)} · {paid ? `Dibayar ${p.paid_at ? formatDateOnly(p.paid_at) : ""}` : "Belum bayar"}
                  </p>
                </div>
                {bill.is_creator && !paid && bill.status === "ACTIVE" && (
                  <button
                    type="button"
                    onClick={() => remind(p)}
                    disabled={reminding === p.user_id || cooldownLeft > 0}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-gold-400/40 bg-app-accent-soft px-3 py-2 text-xs font-black text-app-kicker hover:bg-app-accent-soft disabled:opacity-60"
                  >
                    {reminding === p.user_id
                      ? "Mengirim..."
                      : cooldownLeft > 0
                        ? `Tunggu ${Math.ceil(cooldownLeft / 60000)} mnt`
                        : <><Icon name="bell" size={16} /> Ingatkan</>}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
