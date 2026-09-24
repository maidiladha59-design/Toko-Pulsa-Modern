"use client";

import { useRouter } from "next/navigation";

export default function PPOBReceiptButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/orders/${orderId}/receipt`)}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      🧾 Lihat / Cetak Struk
    </button>
  );
}