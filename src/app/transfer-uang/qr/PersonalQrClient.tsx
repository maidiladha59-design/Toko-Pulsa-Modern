"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { useToast } from "@/components/ToastProvider";
import { buildPersonalQrPayload } from "@/lib/transfer/qr";

export default function PersonalQrClient({ token: initialToken, displayName }: { token: string; displayName: string }) {
  const toast = useToast();
  const [token, setToken] = useState(initialToken);
  const [amount, setAmount] = useState("");
  const [origin, setOrigin] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const amountNumber = Number(amount || 0) || 0;
  const payload = useMemo(
    () => (origin ? buildPersonalQrPayload(origin, token, amountNumber > 0 ? amountNumber : null) : ""),
    [origin, token, amountNumber]
  );

  useEffect(() => {
    if (!payload) return;
    let active = true;
    QRCode.toDataURL(payload, { width: 720, margin: 2, color: { dark: "#09090B", light: "#FFFFFF" } })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(""); });
    return () => { active = false; };
  }, [payload]);

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = "qr-pribadi-aidil-store.png";
    a.click();
    toast.show("QR diunduh sebagai PNG.", "success");
  }

  async function copyLink() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      toast.show("Link QR disalin.", "success");
    } catch {
      toast.show("Gagal menyalin link.", "error");
    }
  }

  async function shareLink() {
    if (!payload) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "QR Pribadi AIDIL STORE", text: `Transfer saldo ke ${displayName} lewat AIDIL STORE.`, url: payload });
      } catch {
        // Dibatalkan pengguna.
      }
      return;
    }
    copyLink();
  }

  async function regenerate() {
    if (!window.confirm("Buat ulang QR? QR lama akan langsung tidak berlaku dan tidak bisa dipakai lagi.")) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/transfer/qr/regenerate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { toast.show(json.message || "Gagal membuat ulang QR.", "error"); return; }
      setToken(json.token);
      toast.show("QR baru berhasil dibuat. QR lama sudah tidak berlaku.", "success");
    } catch {
      toast.show("Koneksi bermasalah.", "error");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="rounded-3xl bg-slate-950 p-6 text-center text-white">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">QR Pribadi</p>
        <h1 className="mt-2 text-2xl font-black">Terima Saldo</h1>
        <p className="mt-1 text-sm text-white/60">Tunjukkan QR ini agar pengguna lain bisa transfer saldo ke <b className="text-white">{displayName}</b>.</p>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-slate-100 bg-white p-3 shadow-inner">
          {qrDataUrl ? (
            <Image src={qrDataUrl} alt="QR Pribadi AIDIL STORE" width={280} height={280} unoptimized className="h-auto w-full" />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-xl bg-slate-50 text-sm font-bold text-slate-400">Membuat QR...</div>
          )}
        </div>

        <p className="mt-3 text-center text-sm font-black text-slate-900">{displayName}</p>
        <p className="text-center text-[11px] font-bold uppercase tracking-wide text-slate-400">AIDIL STORE · QR Transfer Saldo</p>

        <div className="mt-4">
          <label className="text-xs font-black uppercase tracking-wide text-slate-400">Nominal otomatis (opsional)</label>
          <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
            <span className="text-sm font-bold text-slate-400">Rp</span>
            <input
              type="text"
              inputMode="numeric"
              value={amount ? Number(amount).toLocaleString("id-ID") : ""}
              onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 12))}
              placeholder="0"
              className="w-full bg-transparent px-2 py-2.5 text-lg font-black text-slate-900 outline-none"
            />
            {amount && (
              <button type="button" onClick={() => setAmount("")} aria-label="Hapus nominal" className="text-xs font-bold text-slate-400 hover:text-red-600">✕</button>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">
            {amountNumber > 0
              ? "QR ini meminta nominal tersebut; penerima tetap bisa mengubahnya di form transfer."
              : "Kosongkan agar penerima mengisi nominalnya sendiri."}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={downloadQr} disabled={!qrDataUrl} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">⬇️ Unduh PNG</button>
          <button type="button" onClick={copyLink} disabled={!payload} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">🔗 Salin Link</button>
          <button type="button" onClick={shareLink} disabled={!payload} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">📤 Bagikan</button>
          <button type="button" onClick={regenerate} disabled={regenerating} className="rounded-2xl border border-red-200 px-4 py-3 text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
            {regenerating ? "Memproses..." : "♻️ Buat Ulang QR"}
          </button>
        </div>

        {payload && (
          <div className="mt-3 overflow-hidden rounded-xl bg-slate-50 p-3">
            <p className="break-all text-[11px] leading-5 text-slate-500">{payload}</p>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-gold-200 bg-gold-50 p-5 text-sm text-zinc-950">
        <p className="font-black">🔐 QR ini aman dibagikan</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
          <li>QR hanya berisi token publik acak — tanpa email, nomor HP, saldo, atau data pribadi.</li>
          <li>Penerima harus punya akun dan login AIDIL STORE untuk melanjutkan transfer.</li>
          <li>Tekan <b>Buat Ulang QR</b> jika QR lama bocor — QR lama langsung tidak berlaku.</li>
        </ul>
      </section>

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/transfer-uang" className="rounded-2xl bg-gold-600 px-4 py-3 text-center text-sm font-black text-white hover:bg-gold-700">📤 Kirim Saldo</Link>
        <Link href="/wallet" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700 hover:bg-slate-50">💰 Lihat Saldo</Link>
      </div>
    </div>
  );
}
