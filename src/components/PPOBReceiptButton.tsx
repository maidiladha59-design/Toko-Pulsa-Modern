"use client";

import { useRouter } from "next/navigation";

export default function PPOBReceiptButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/orders/${orderId}/receipt`)}
      className="rounded-xl border border-app-border bg-app-surface px-4 py-2.5 text-sm font-black text-app-text shadow-sm transition hover:bg-app-inset"
    >
      🧾 Lihat / Cetak Struk
    </button>
  );
}