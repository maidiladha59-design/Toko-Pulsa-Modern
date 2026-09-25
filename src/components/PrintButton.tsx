"use client";
import { useState } from "react";

type Props = { receiptText?: string; shareTitle?: string };
const COMMON_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "00001101-0000-1000-8000-00805f9b34fb",
];

export default function PrintButton({ receiptText = "AIDIL STORE\nStruk Transaksi\n\n", shareTitle = "Struk - AIDIL STORE" }: Props) {
  const [bluetooth, setBluetooth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function connectAndPrint() {
    setMessage("");
    const bt = (navigator as any).bluetooth;
    if (!bt?.requestDevice) {
      setMessage("Peramban ini belum mendukung Web Bluetooth. Gunakan Chrome/Edge pada perangkat yang mendukung Bluetooth.");
      return;
    }
    setBusy(true);
    try {
      const device = await bt.requestDevice({ acceptAllDevices: true, optionalServices: COMMON_PRINTER_SERVICES });
      if (!device?.gatt) throw new Error("Perangkat Bluetooth tidak mendukung koneksi GATT.");
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();
      let writable: any = null;
      for (const service of services) {
        const chars = await service.getCharacteristics();
        writable = chars.find((c: any) => c.properties?.write || c.properties?.writeWithoutResponse);
        if (writable) break;
      }
      if (!writable) throw new Error("Tidak ditemukan kanal cetak yang dapat ditulis pada printer ini.");
      const encoder = new TextEncoder();
      const data = encoder.encode("\x1b@" + receiptText + "\n\n\n\x1dV\x00");
      const chunkSize = 80;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        if (writable.writeValueWithoutResponse) await writable.writeValueWithoutResponse(chunk);
        else await writable.writeValue(chunk);
      }
      setBluetooth(true);
      setMessage(`Struk dikirim ke ${device.name || "printer Bluetooth"}.`);
    } catch (error: any) {
      if (error?.name !== "NotFoundError") setMessage(error?.message || "Printer Bluetooth tidak dapat digunakan.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    setMessage("");
    try {
      if (navigator.share) await navigator.share({ title: shareTitle, text: receiptText });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(receiptText); setMessage("Struk disalin ke clipboard."); }
    } catch (error: any) {
      if (error?.name !== "AbortError") setMessage("Struk tidak dapat dibagikan.");
    }
  }

  return (
    <div className="no-print mt-6 space-y-3">
      <button
        type="button"
        disabled={busy}
        onClick={connectAndPrint}
        className={`w-full rounded-xl px-4 py-3 text-sm font-black ${busy ? "animate-pulse bg-gold-100 text-zinc-900" : "bg-zinc-950 text-gold-400"}`}
      >
        {busy ? "Menghubungkan..." : bluetooth ? "✓ Cetak Bluetooth Berhasil" : "🖨️ Cetak via Bluetooth"}
      </button>
      <button type="button" onClick={() => window.print()} className="w-full rounded-xl bg-gold-400 px-4 py-3 text-sm font-black text-black hover:bg-gold-300">
        🖨️ Cetak / Simpan PDF
      </button>
      <button type="button" onClick={share} className="w-full rounded-xl border border-gold-300 px-4 py-3 text-sm font-black text-zinc-800 hover:bg-gold-50">
        📤 Bagikan Struk
      </button>
      {message && <p className="rounded-xl bg-gold-50 p-3 text-xs leading-5 text-zinc-950">{message}</p>}
    </div>
  );
}