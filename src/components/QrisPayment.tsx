"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";

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
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-5xl">✅</div>
        <p className="mt-3 text-lg font-black text-emerald-800">Pembayaran Berhasil!</p>
        <p className="mt-1 text-sm text-emerald-700">Mengarahkan ke halaman pesanan...</p>
      </div>
    );
  }

  if (status === "FAILED" || expired) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center">
        <div className="text-5xl">⏱️</div>
        <p className="mt-3 text-lg font-black text-red-700">QRIS Kadaluarsa / Gagal</p>
        <p className="mt-1 text-sm text-red-600">Silakan buat pesanan baru untuk mendapatkan QR code lagi.</p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-gold-600">Scan untuk Bayar</p>
      <div className="mx-auto mt-4 w-fit rounded-2xl border border-slate-200 bg-white p-3">
        <img src={qrisImage} alt="QRIS Payment" className="h-64 w-64" />
      </div>
      <p className="mt-4 text-2xl font-black text-slate-900">{formatRupiah(amount)}</p>
      <p className="mt-1 text-xs text-slate-500">Scan kode QRIS di atas menggunakan aplikasi DANA, GoPay, OVO, ShopeePay, m-banking, atau aplikasi pendukung QRIS lainnya.</p>
      <div className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Menunggu pembayaran · {label}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Halaman ini akan otomatis berpindah begitu pembayaran terdeteksi.</p>
    </div>
  );
}
