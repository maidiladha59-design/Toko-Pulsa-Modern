"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";
import Icon from "@/components/icons/Icon";

type Props = {
  orderId: string;
  qrisImage: string;
  amount: number;
  expiredAt: string;
  onSettled?: (status: string) => void;
};

function useCountdown(expiredAt: string) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(expiredAt).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setRemaining(Math.max(0, new Date(expiredAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiredAt]);
  const totalSeconds = Math.floor(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return { label: `${mm}:${ss}`, expired: remaining <= 0 };
}

export default function QrisPayment({ orderId, qrisImage, amount, expiredAt, onSettled }: Props) {
  const router = useRouter();
  const { label, expired } = useCountdown(expiredAt);
  const [status, setStatus] = useState<"PENDING" | "COMPLETED" | "PROCESSING" | "FAILED">("PENDING");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`);
        const json = await res.json();
        if (json.status && json.status !== "PENDING") {
          setStatus(json.status);
          if (pollingRef.current) clearInterval(pollingRef.current);
          onSettled?.(json.status);
          setTimeout(() => router.push(`/orders/${orderId}`), 1200);
        }
      } catch {
        // koneksi bermasalah sementara, coba lagi di interval berikutnya
      }
    }
    poll();
    pollingRef.current = setInterval(poll, 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  if (status === "COMPLETED" || status === "PROCESSING") {
    return (
      <div className="rounded-3xl border border-success-500/30 bg-success-500/10 p-8 text-center">
        <div><Icon name="check_circle" size={48} /></div>
        <p className="mt-3 text-xl font-black text-success-600 dark:text-success-400">Pembayaran Berhasil!</p>
        <p className="mt-1 text-sm text-success-600/80 dark:text-success-400/80">Mengarahkan ke halaman pesanan...</p>
      </div>
    );
  }

  if (status === "FAILED" || expired) {
    return (
      <div className="rounded-3xl border border-danger-500/30 bg-danger-500/10 p-8 text-center">
        <div><Icon name="hourglass" size={36} /></div>
        <p className="mt-3 text-lg font-black text-danger-600 dark:text-danger-400">QRIS Kadaluarsa / Gagal</p>
        <p className="mt-1 text-sm text-danger-600/80 dark:text-danger-400/80">Silakan buat pesanan baru untuk mendapatkan QR code lagi.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-app-border bg-app-surface p-6 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-app-kicker">Scan untuk Bayar</p>
      <div className="mx-auto mt-4 w-fit rounded-2xl border border-app-border bg-white p-3">
        <Image src={qrisImage} alt="QRIS Payment" width={256} height={256} unoptimized className="h-64 w-64" />
      </div>
      <p className="mt-4 text-3xl font-black tabular-nums text-app-kicker">{formatRupiah(amount)}</p>
      <p className="mt-1 text-xs text-app-subtle">Scan kode QRIS di atas menggunakan aplikasi DANA, GoPay, OVO, ShopeePay, m-banking, atau aplikasi pendukung QRIS lainnya.</p>
      <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-app-accent-soft px-4 py-2 text-sm font-bold tabular-nums text-app-kicker">
        <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" /> Menunggu pembayaran · {label}
      </div>
      <p className="mt-3 text-xs text-app-subtle">Halaman ini akan otomatis berpindah begitu pembayaran terdeteksi.</p>
    </div>
  );
}
