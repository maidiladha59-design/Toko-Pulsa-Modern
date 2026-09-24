"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { printReceiptBluetooth, receiptToText, type ReceiptData } from "@/lib/receipt-print";

type Props = ReceiptData & { backHref?: string };

const GREEN = "#57bb7f";
const PAPER = "#f4f4f4";

const scallopTop = { background: `radial-gradient(circle at 10px 0, ${GREEN} 0 6px, transparent 6.5px) 0 0 / 20px 10px repeat-x, #fff` };
const scallopBottom = { background: `radial-gradient(circle at 10px 100%, ${PAPER} 0 6px, transparent 6.5px) 0 0 / 20px 10px repeat-x, #fff` };

function IconBack() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>; }
function IconBluetooth() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="3" /><path d="M8 8l8 8-4 3.5V4.5L16 8l-8 8" /></svg>; }
function IconShare() { return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z" /></svg>; }
function IconPrint() { return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z" /></svg>; }
function IconHelp() { return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" /></svg>; }
function IconTestimonial() { return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z" /><path d="M8 13.5V16h2.5l6-6-2.5-2.5z" fill="#fff" /></svg>; }

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

  const iconBtn = "flex h-11 w-11 items-center justify-center rounded-full text-white transition active:bg-white/20 hover:bg-white/10";

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f4f4f4] text-[#222] print:static print:overflow-visible print:bg-white">
      <div className="bg-[#57bb7f] pb-24 pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex h-16 max-w-md items-center justify-between px-3">
          <button type="button" onClick={goBack} aria-label="Kembali" className={iconBtn}><IconBack /></button>
          <div className="flex items-center gap-1">
            <button type="button" onClick={printBluetooth} disabled={busy} aria-label="Cetak via Bluetooth" title="Cetak via Bluetooth" className={`${iconBtn} ${busy ? "animate-pulse" : ""}`}><IconBluetooth /></button>
            <button type="button" onClick={share} aria-label="Bagikan struk" title="Bagikan" className={iconBtn}><IconShare /></button>
            <button type="button" onClick={() => window.print()} aria-label="Cetak atau simpan PDF" title="Cetak / Simpan PDF" className={iconBtn}><IconPrint /></button>
          </div>
        </div>
      </div>

      <main className="mx-auto -mt-[5.25rem] max-w-md px-4 pb-10 print:mt-0 print:max-w-none print:px-0 print:pb-0">
        <div>
          <div className="h-[10px] print:hidden" style={scallopTop} />
          <div className="bg-white px-6 pb-8 pt-6 print:px-2">
            <p className="text-center text-[10px] font-black tracking-[.3em] text-[#B8941F]">AIDIL STORE</p>
            <h1 className="mt-1 text-center text-xl font-semibold">{title}</h1>

            <dl className="mt-8 space-y-4 text-[15px] leading-6">
              {rows.map((row, i) => (
                <div key={`${row.label}-${i}`} className="flex gap-2">
                  <dt className="w-[38%] shrink-0 text-[#333]">{row.label}</dt>
                  <span aria-hidden>:</span>
                  <dd className="min-w-0 flex-1 break-words text-[#111]">{row.value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-6 border-t border-dashed border-slate-300 pt-5">
              <div className="flex items-center justify-between gap-4 text-lg font-bold">
                <span>{total.label}</span>
                <span>{total.value}</span>
              </div>
            </div>
            <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">{footer || "Terima kasih telah berbelanja di AIDIL STORE. Simpan struk ini sebagai bukti transaksi."}</p>
          </div>
          <div className="h-[10px] print:hidden" style={scallopBottom} />
        </div>

        {message && (
          <p className={`mt-4 rounded-xl px-4 py-3 text-xs font-bold leading-5 print:hidden ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message.text}</p>
        )}

        <div className="mt-8 flex items-center justify-between px-2 text-[15px] font-medium print:hidden">
          <Link href="/bantuan" className="flex items-center gap-3 rounded-xl py-2 pr-3"><IconHelp />Butuh bantuan?</Link>
          <Link href="/#testimoni" className="flex items-center gap-3 rounded-xl py-2 pl-3"><IconTestimonial />Testimonial</Link>
        </div>
      </main>
    </div>
  );
}