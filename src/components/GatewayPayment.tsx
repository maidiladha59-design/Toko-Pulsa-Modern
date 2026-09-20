"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRupiah } from "@/lib/utils";

type Props = {
  orderId: string;
  paymentMethod: "QRIS" | "BANK_VA";
  gatewayMethod: string;
  paymentNumber: string;
  qrisImage?: string | null;
  amount: number;
  expiredAt: string;
};

const bankNames: Record<string, string> = {
  bri_va: "BRI Virtual Account",
  bni_va: "BNI Virtual Account",
  cimb_niaga_va: "CIMB Niaga Virtual Account",
  sampoerna_va: "Sampoerna Virtual Account",
  bnc_va: "BNC Virtual Account",
  maybank_va: "Maybank Virtual Account",
  permata_va: "Permata Virtual Account",
  atm_bersama_va: "ATM Bersama Virtual Account",
  artha_graha_va: "Artha Graha Virtual Account",
};

function countdown(expiredAt: string) {
  const seconds = Math.max(0, Math.floor((new Date(expiredAt).getTime() - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function GatewayPayment({
  orderId, paymentMethod, gatewayMethod, paymentNumber, qrisImage, amount, expiredAt,
}: Props) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => countdown(expiredAt));
  const [status, setStatus] = useState("PENDING");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const countdownTimer = setInterval(() => setRemaining(countdown(expiredAt)), 1000);

    async function poll() {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, { cache: "no-store" });
        const json = await res.json();
        if (json.status && json.status !== "PENDING") {
          setStatus(json.status);
          if (timer.current) clearInterval(timer.current);
          setTimeout(() => router.push(`/orders/${orderId}`), 900);
        }
      } catch {}
    }

    poll();
    timer.current = setInterval(poll, 4000);

    return () => {
      clearInterval(countdownTimer);
      if (timer.current) clearInterval(timer.current);
    };
  }, [orderId, expiredAt, router]);

  if (status === "COMPLETED" || status === "PROCESSING") {
    return (
      <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <div className="text-5xl">✓</div>
        <p className="mt-3 text-xl font-black text-emerald-800">Pembayaran terdeteksi</p>
        <p className="mt-1 text-sm text-emerald-700">Pesanan sedang dibuka secara otomatis...</p>
      </div>
    );
  }

  if (status === "FAILED" || remaining === "00:00") {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-center">
        <div className="text-4xl">⌛</div>
        <p className="mt-3 text-lg font-black text-red-700">Pembayaran kedaluwarsa</p>
        <p className="mt-1 text-sm text-red-600">Buat pesanan baru untuk mendapatkan instruksi pembayaran baru.</p>
      </div>
    );
  }

  const isQris = paymentMethod === "QRIS";
  const title = isQris ? "Scan QRIS" : (bankNames[gatewayMethod] || "Virtual Account");

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-xl shadow-slate-900/5 sm:p-8">
      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-amber-700">
        Menunggu pembayaran
      </span>
      <h2 className="mt-3 text-2xl font-black text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">Nominal transaksi</p>
      <p className="mt-1 text-3xl font-black text-gold-600">{formatRupiah(amount)}</p>

      {isQris && qrisImage ? (
        <>
          <div className="mx-auto mt-5 w-fit rounded-3xl border border-slate-200 bg-white p-3">
            <img src={qrisImage} alt="QRIS pembayaran Aidil Store" className="h-64 w-64 sm:h-72 sm:w-72" />
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">
            Bisa dibayar dengan aplikasi yang mendukung QRIS, termasuk mobile banking dan e-wallet yang mendukung QRIS.
          </p>
        </>
      ) : (
        <div className="mt-5 rounded-2xl border border-gold-100 bg-gold-50 p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gold-600">Nomor Virtual Account</p>
          <p className="mt-2 break-all text-2xl font-black tracking-widest text-slate-900">{paymentNumber}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Transfer ke nomor VA di atas sesuai nominal. Sistem akan memeriksa status pembayaran secara otomatis.</p>
        </div>
      )}

      <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-gold-600" />
        Cek otomatis · {remaining}
      </div>
      <p className="mt-3 text-[11px] text-slate-400">Tidak perlu mengirim bukti transfer atau menunggu approve admin.</p>
    </div>
  );
}
