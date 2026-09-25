"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { printReceiptBluetooth, receiptToText, type ReceiptData } from "@/lib/receipt-print";

type Props = ReceiptData & { backHref?: string };

const OK_STATUS = ["BERHASIL", "SUKSES", "OK", "COMPLETED", "SUCCESS"];

function isOkStatus(value: string) {
  return OK_STATUS.includes(String(value).toUpperCase());
}

function StatusPill({ text }: { text: string }) {
  const ok = isOkStatus(text);
  return (
    <span className={`rounded-full px-3 py-0.5 text-xs font-black tracking-wide ${ok ? "bg-gold-400 text-black" : "bg-zinc-950 text-gold-400"}`}>
      {text}
    </span>
  );
}

export default function ReceiptView({ title, rows, total, footer, backHref = "/transactions" }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const receipt: ReceiptData = { title, rows, total, footer };

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(backHref);
  }

  async function printBluetooth() {
    if (busy) return;
    setMessage(null);
    setBusy(true);
    try {
      const name = await printReceiptBluetooth(receipt);
      setMessage({ ok: true, text: `Struk berhasil dikirim ke ${name}.` });
    } catch (error: any) {
      if (error?.name !== "NotFoundError") setMessage({ ok: false, text: error?.message || "Printer Bluetooth tidak dapat digunakan." });
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setMessage(null);
    const text = receiptToText(receipt);
    try {
      if (navigator.share) await navigator.share({ title: `${title} - AIDIL STORE`, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); setMessage({ ok: true, text: "Struk disalin ke clipboard." }); }
    } catch (error: any) {
      if (error?.name !== "AbortError") setMessage({ ok: false, text: "Struk tidak dapat dibagikan." });
    }
  }

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f4f4f4] print:static print:overflow-visible print:bg-white">
      <main
        className="mx-auto max-w-md animate-page-in pb-8 print:max-w-none print:pb-0"
        style={{ WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
      >
        <div className="no-print flex items-center justify-between rounded-t-3xl bg-zinc-950 px-5 pb-5 pt-[calc(env(safe-area-inset-top)+16px)] text-gold-400">
          <button type="button" onClick={goBack} aria-label="Kembali" className="text-2xl font-black leading-none">←</button>
          <span className="text-[11px] font-black uppercase tracking-[.25em]">Struk Digital</span>
        </div>
        <div
          className="no-print h-3 bg-white"
          style={{ backgroundImage: "radial-gradient(circle at 10px 0, #09090b 7px, transparent 8px)", backgroundSize: "20px 12px", backgroundRepeat: "repeat-x" }}
        />

        <div className="print-avoid-break bg-white px-5 pb-6 pt-4 text-zinc-950 shadow-lg print:shadow-none">
          <div className="border-b-2 border-gold-400 pb-5 text-center">
            <img src="/aidil-logo.png" alt="AIDIL STORE" className="mx-auto h-20 w-20 rounded-2xl object-cover ring-2 ring-gold-400" />
            <p className="mt-3 text-xs font-black tracking-[.25em] text-gold-700">AIDIL STORE</p>
            <h1 className="mt-1 text-2xl font-black text-zinc-950">{title}</h1>
          </div>

          <dl className="mt-5 space-y-3 border-b border-dashed border-gold-500 pb-5">
            {rows.map((row, i) => (
              <div key={`${row.label}-${i}`} className="flex justify-between gap-4 text-sm">
                <dt className="text-zinc-500">{row.label}</dt>
                <dd className="min-w-0 flex-1 break-words text-right font-bold text-zinc-950">
                  {row.label === "Status" ? <StatusPill text={row.value} /> : row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-6 flex items-center justify-between rounded-2xl bg-zinc-950 px-5 py-4 text-xl">
            <span className="font-black text-gold-400">{total.label}</span>
            <b className="text-gold-400">{total.value}</b>
          </div>

          <p className="mt-5 text-center text-[11px] leading-5 text-zinc-500">
            {footer || "Terima kasih telah berbelanja di AIDIL STORE. Simpan struk ini sebagai bukti transaksi."}
          </p>
        </div>
        <div className="h-1.5 rounded-b-3xl bg-gold-400 print:hidden" />

        <div className="no-print mt-6 space-y-3 px-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={printBluetooth}
              className={`rounded-xl px-4 py-3 text-sm font-black ${busy ? "animate-pulse bg-gold-100 text-zinc-900" : "bg-zinc-950 text-gold-400"}`}
            >
              {busy ? "Menghubungkan..." : "🖨️ Cetak via Bluetooth"}
            </button>
            <button type="button" onClick={() => window.print()} className="rounded-xl bg-gold-400 px-4 py-3 text-sm font-black text-black hover:bg-gold-300">
              🖨️ Cetak / Simpan PDF
            </button>
          </div>
          <button type="button" onClick={share} className="w-full rounded-xl border border-gold-300 px-4 py-3 text-sm font-black text-zinc-800 hover:bg-gold-50">
            📤 Bagikan Struk
          </button>
          {message && (
            <p className={`rounded-xl px-4 py-3 text-xs font-bold leading-5 ${message.ok ? "bg-gold-50 text-zinc-900" : "bg-red-50 text-red-700"}`}>
              {message.text}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}