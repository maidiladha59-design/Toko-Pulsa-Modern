"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/icons/Icon";

export default function RefreshStatusButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  async function refresh() {
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(`/api/ppob/status?order_id=${encodeURIComponent(orderId)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("status_unavailable");
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={loading}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-app-border bg-app-surface px-3 py-2 text-xs font-black text-app-text transition hover:border-gold-400/60 hover:text-app-kicker disabled:opacity-60"
      >
        <Icon name="refresh" size={15} />
        {loading ? "Memeriksa..." : "Cek Status"}
      </button>
      {failed && <p className="text-[11px] text-app-subtle">Status belum bisa diperbarui. Coba lagi sebentar.</p>}
    </div>
  );
}
