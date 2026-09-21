'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

type QRISData = {
  raw: string;
  merchantName?: string;
  amount?: string;
};

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

  // Tag 54 biasanya digunakan untuk nominal.
  // Kosong = QRIS statis, nominal harus diisi manual oleh user.
  const amount = map.get('54');

  return {
    raw,
    merchantName,
    amount,
  };
}

export default function ScanQRIS() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [code, setCode] = useState('');
  const [qris, setQris] = useState<QRISData | null>(null);
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

    router.push('/scan-qris/qris-confirm');
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

            {/* Result */}
            {qris && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">✅</span>

                  <h2 className="font-bold text-green-800">
                    QR Code berhasil dibaca
                  </h2>
                </div>

                {qris.merchantName && (
                  <div className="mb-3">
                    <p className="text-xs font-medium uppercase text-green-700">
                      Merchant
                    </p>

                    <p className="font-semibold text-slate-900">
                      {qris.merchantName}
                    </p>
                  </div>
                )}

                {qris.amount ? (
                  <div className="mb-3">
                    <p className="text-xs font-medium uppercase text-green-700">
                      Nominal
                    </p>

                    <p className="font-semibold text-slate-900">
                      Rp {Number(qris.amount).toLocaleString('id-ID')}
                    </p>
                  </div>
                ) : (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium uppercase text-green-700">
                      Masukkan Nominal Pembayaran
                    </label>
                    <div className="flex items-center rounded-xl border border-green-300 bg-white px-3">
                      <span className="text-sm font-semibold text-slate-500">Rp</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={manualAmount ? Number(manualAmount).toLocaleString('id-ID') : ''}
                        onChange={(e) => setManualAmount(e.target.value.replace(/\D/g, ''))}
                        placeholder="0"
                        className="w-full bg-transparent px-2 py-2.5 text-sm font-semibold text-slate-900 outline-none"
                      />
                    </div>
                    <p className="mt-1 text-xs text-green-700">QRIS ini statis, nominal perlu diisi manual.</p>
                  </div>
                )}

                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-green-700">
                    Data QR
                  </p>

                  <div className="max-h-32 overflow-auto rounded-xl bg-white p-3">
                    <p className="break-all text-xs text-slate-700">
                      {code}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={goToPayment}
                  className="mt-4 w-full rounded-xl bg-gold-600 px-4 py-3 text-sm font-black text-white transition hover:bg-gold-700"
                >
                  💳 Lanjutkan ke Pembayaran
                </button>

                <button
                  type="button"
                  onClick={clearResult}
                  className="mt-2 w-full rounded-xl border border-green-300 bg-white px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"
                >
                  Bersihkan Hasil
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}