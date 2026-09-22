'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

type QRISData = {
  raw: string;
  merchantName?: string;
  merchantCity?: string;
  postalCode?: string;
  countryCode?: string;
  currency?: string;
  nmid?: string;
  amount?: string;
};

const CURRENCY_MAP: Record<string, string> = { '360': 'IDR (Rupiah)' };

function parseQris(raw: string): QRISData {
  const map = new Map<string, string>();

  let i = 0;

  while (i + 4 <= raw.length) {
    const id = raw.substring(i, i + 2);
    const length = Number(raw.substring(i + 2, i + 4));

    if (!Number.isFinite(length) || length < 0) break;

    const valueStart = i + 4;
    const valueEnd = valueStart + length;

    if (valueEnd > raw.length) break;

    const value = raw.substring(valueStart, valueEnd);
    map.set(id, value);

    i = valueEnd;
  }

  // QRIS merchant name biasanya berada di tag 59
  // Namun beberapa QRIS bisa menggunakan struktur berbeda.
  const merchantName = map.get('59');

  // Tag 60 = kota merchant, 61 = kode pos, 58 = kode negara, 53 = mata uang.
  const merchantCity = map.get('60');
  const postalCode = map.get('61');
  const countryCode = map.get('58');
  const currencyRaw = map.get('53');
  const currency = currencyRaw ? CURRENCY_MAP[currencyRaw] || currencyRaw : undefined;

  // NMID (National Merchant ID) biasanya ada di subfield tag 51/26-51, ambil apa adanya jika ditemukan.
  const merchantAccountBlock = map.get('51') || map.get('26');
  let nmid: string | undefined;
  if (merchantAccountBlock) {
    const idMatch = merchantAccountBlock.match(/ID\d{2}(\w{8,15})/);
    if (idMatch) nmid = idMatch[1];
  }

  // Tag 54 biasanya digunakan untuk nominal.
  // Kosong = QRIS statis, nominal harus diisi manual oleh user.
  const amount = map.get('54');

  return {
    raw,
    merchantName,
    merchantCity,
    postalCode,
    countryCode,
    currency,
    nmid,
    amount,
  };
}

function shortRef(raw: string) {
  // Referensi singkat non-sensitif untuk ditampilkan ke pengguna, diambil dari data mentah QRIS.
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `QRS-${hash.toString(36).toUpperCase().slice(0, 8)}`;
}

function DetailRow({ label, value, mono, badge }: { label: string; value: string; mono?: boolean; badge?: 'success' }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-white px-4 py-3">
      <span className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {badge === 'success' ? (
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{value}</span>
      ) : (
        <span className={`text-right text-sm font-black text-slate-900 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      )}
    </div>
  );
}

export default function ScanQRIS() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [code, setCode] = useState('');
  const [qris, setQris] = useState<QRISData | null>(null);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);
  const [manualAmount, setManualAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<'unknown'|'granted'|'denied'>('unknown');

  function stopScanner() {
    try {
      controlsRef.current?.stop();
    } catch {
      // Abaikan error ketika kamera sudah berhenti
    }

    controlsRef.current = null;

    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;

      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    } catch {
      // Abaikan error cleanup kamera
    }

    readerRef.current = null;
    setCameraActive(false);
  }

  async function startScanner() {
    setError('');
    setCode('');
    setQris(null);
    setManualAmount('');

    if (!videoRef.current) {
      setError('Kamera belum siap.');
      return;
    }

    stopScanner();

    setBusy(true);

    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      permissionStream.getTracks().forEach((track) => track.stop());
      setCameraPermission('granted');
      const hints = new Map();

      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
      ]);

      const reader = new BrowserMultiFormatReader(hints);

      readerRef.current = reader;

      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            const raw = result.getText();

            setCode(raw);
            setQris(parseQris(raw));
            setScannedAt(new Date());
            setError('');
            stopScanner();
          }

          // Error decode sementara dari kamera tidak perlu ditampilkan.
          // ZXing memang akan menghasilkan error ketika belum menemukan QR.
          void error;
        }
      );

      controlsRef.current = controls;
      setCameraActive(true);
    } catch (err) {
      setCameraPermission('denied');
      console.error('QRIS scanner error:', err);

      setError(
        'Kamera tidak dapat digunakan. Pastikan izin kamera sudah diberikan.'
      );

      stopScanner();
    } finally {
      setBusy(false);
    }
  }

  function clearResult() {
    setCode('');
    setQris(null);
    setScannedAt(null);
    setManualAmount('');
    setError('');
  }

  function goToPayment() {
    if (!qris) return;

    const finalAmount = qris.amount || manualAmount.replace(/\D/g, '');

    if (!finalAmount || Number(finalAmount) <= 0) {
      setError('Masukkan nominal pembayaran terlebih dahulu.');
      return;
    }

    // Simpan data QRIS sementara untuk dipakai halaman konfirmasi pembayaran
    sessionStorage.setItem(
      'qris_payment',
      JSON.stringify({
        raw: qris.raw,
        merchantName: qris.merchantName || 'Merchant QRIS',
        amount: finalAmount,
        isStatic: !qris.amount,
      })
    );

    router.push('/qris/confirm');
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          {/* Header */}
          <div className="bg-slate-950 px-6 py-6 text-white">
            <h1 className="text-2xl font-bold">
              Scan QRIS
            </h1>

            <p className="mt-1 text-sm text-slate-300">
              Scan QRIS menggunakan kamera atau gambar.
            </p>
          </div>

          <div className="space-y-5 p-6">
            {/* Camera */}
            <div className="overflow-hidden rounded-2xl bg-black">
              <video
                ref={videoRef}
                className="aspect-square w-full object-cover"
                muted
                playsInline
              />

              {!cameraActive && (
                <div className="flex aspect-square items-center justify-center bg-slate-950">
                  <div className="text-center text-white">
                    <div className="mx-auto mb-3 text-5xl">
                      📷
                    </div>

                    <p className="text-sm text-slate-300">
                      Kamera belum aktif
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4 text-sm text-zinc-950">
              <p className="font-black">🔐 Izin kamera diperlukan</p>
              <p className="mt-1 text-xs leading-5">AIDIL STORE hanya menggunakan kamera untuk membaca QRIS. Tekan tombol di bawah dan pilih <b>Izinkan</b> saat browser meminta akses kamera.</p>
              {cameraPermission === 'denied' && <p className="mt-2 font-bold text-red-700">Akses kamera ditolak. Aktifkan izin Kamera pada pengaturan browser/perangkat lalu coba lagi.</p>}
            </div>

            {/* Camera button */}
            <button
              type="button"
              onClick={startScanner}
              disabled={busy}
              className="w-full rounded-2xl bg-gold-600 px-5 py-3 font-semibold text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? 'Memproses...'
                : cameraActive
                  ? 'Scan Ulang'
                  : cameraPermission === 'granted' ? '📷 Mulai Scan Kamera' : '🔐 Izinkan Kamera & Mulai Scan'}
            </button>

            {/* Error */}
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <div className="font-semibold">
                  Gagal membaca QRIS
                </div>

                <div className="mt-1">
                  {error}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Popup detail QRIS */}
      {qris && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget) clearResult(); }}
        >
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-3xl bg-slate-950 px-6 py-5 text-white">
              <div className="flex items-center gap-2">
                <span className="text-xl">✅</span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">QRIS berhasil dibaca</p>
                  <h2 className="text-lg font-black">Detail Pembayaran QRIS</h2>
                </div>
              </div>
              <button type="button" onClick={clearResult} aria-label="Tutup" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg font-bold hover:bg-white/20">✕</button>
            </div>

            <div className="space-y-4 p-6">
              {/* Nominal - paling atas & menonjol */}
              <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4 text-center">
                <p className="text-xs font-black uppercase tracking-widest text-gold-700">Total Nominal</p>
                {qris.amount ? (
                  <p className="mt-1 text-3xl font-black text-slate-900">Rp {Number(qris.amount).toLocaleString('id-ID')}</p>
                ) : (
                  <>
                    <div className="mx-auto mt-2 flex max-w-[220px] items-center rounded-xl border border-gold-300 bg-white px-3">
                      <span className="text-sm font-semibold text-slate-500">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoFocus
                        value={manualAmount ? Number(manualAmount).toLocaleString('id-ID') : ''}
                        onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="w-full bg-transparent px-2 py-2.5 text-center text-lg font-black text-slate-900 outline-none"
                      />
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-gold-700">QRIS statis · nominal diisi manual</p>
                  </>
                )}
              </div>

              {/* Detail rapi */}
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                <DetailRow label="Nama Merchant" value={qris.merchantName || 'Tidak diketahui'} />
                {qris.merchantCity && <DetailRow label="Kota Merchant" value={qris.merchantCity} />}
                {qris.postalCode && <DetailRow label="Kode Pos" value={qris.postalCode} />}
                {qris.nmid && <DetailRow label="NMID" value={qris.nmid} mono />}
                <DetailRow label="Mata Uang" value={qris.currency || 'IDR (Rupiah)'} />
                <DetailRow label="Tipe QRIS" value={qris.amount ? 'Dinamis (nominal tetap)' : 'Statis (nominal manual)'} />
                <DetailRow label="Referensi" value={shortRef(qris.raw)} mono />
                <DetailRow label="Waktu Scan" value={scannedAt ? scannedAt.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }) : '-'} />
                <DetailRow label="Status" value="Berhasil dibaca" badge="success" />
              </div>

              <div>
                <p className="mb-1 text-xs font-bold uppercase text-slate-400">Data mentah QR</p>
                <div className="max-h-24 overflow-auto rounded-xl bg-slate-50 p-3">
                  <p className="break-all text-[11px] leading-5 text-slate-500">{code}</p>
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={goToPayment}
                  className="w-full rounded-2xl bg-gold-600 px-4 py-3.5 text-sm font-black text-white transition hover:bg-gold-700"
                >
                  💳 Lanjutkan ke Pembayaran
                </button>
                <button
                  type="button"
                  onClick={startScanner}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  🔄 Scan Ulang
                </button>
                <button
                  type="button"
                  onClick={clearResult}
                  className="w-full rounded-2xl px-4 py-2 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Batalkan
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}