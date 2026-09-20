"use client";

export default function PPOBReceiptButton({ orderId }: { orderId: string }) {
  return (
    <button
      type="button"
      onClick={() => window.open(`/orders/${orderId}/receipt`, "_blank", "noopener,noreferrer")}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      🧾 Lihat / Cetak Struk
    </button>
  );
}
