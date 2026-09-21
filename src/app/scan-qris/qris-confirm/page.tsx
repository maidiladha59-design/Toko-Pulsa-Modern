'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type PendingPayment = {
  raw: string;
  merchantName: string;
  amount: string;
  isStatic: boolean;
};

export default function QrisConfirmPage() {
  const router = useRouter();
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem('qris_payment');

    if (!stored) {
      router.replace('/scan-qris');
      return;
    }

    try {
      setPayment(JSON.parse(stored));
    } catch {
      router.replace('/scan-qris');
    }
  }, [router]);

  async function handleConfirmPayment() {
    if (!payment) return;

    setLoading(true);
    setError('');

    try {
      // PENTING: sesuaikan endpoint ini dengan API route pembayaran QRIS
      // yang sudah/akan kamu buat di backend (potong saldo wallet + kirim ke payment gateway).
      const response = await fetch('/api/payment/qris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawQris: payment.raw,
          merchantName: payment.merchantName,
          amount: Number(payment.amount),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Pembayaran gagal diproses.');
      }

      setSuccess(true);
      sessionStorage.removeItem('qris_payment');
    } catch (err: any) {
      setError(err?.message || 'Pembayaran gagal diproses.');
    } finally {
      setLoading(false);
    }
  }

  if (!payment) return null;

  if (success) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✅
          </div>
          <h1 className="text-xl font-black text-slate-900">Pembayaran Berhasil</h1>
          <p className="mt-2 text-sm text-slate-500">
            Pembayaran ke {payment.merchantName} sebesar Rp{' '}
            {Number(payment.amount).toLocaleString('id-ID')} berhasil diproses.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-xl bg-gold-600 px-4 py-3 text-sm font-black text-white hover:bg-gold-700"
          >
            Kembali ke Beranda
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl bg-white shadow-xl">
          <div className="bg-slate-950 px-6 py-6 text-white">
            <h1 className="text-2xl font-bold">Konfirmasi Pembayaran</h1>
            <p className="mt-1 text-sm text-slate-300">
              Periksa detail sebelum melanjutkan.
            </p>
          </div>

          <div className="space-y-5 p-6">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-medium uppercase text-slate-400">Merchant</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{payment.merchantName}</p>

              <p className="mt-4 text-xs font-medium uppercase text-slate-400">
                Total Pembayaran
              </p>
              <p className="mt-1 text-3xl font-black text-slate-900">
                Rp {Number(payment.amount).toLocaleString('id-ID')}
              </p>

              {payment.isStatic && (
                <p className="mt-2 text-xs text-slate-500">
                  Nominal ini kamu masukkan sendiri (QRIS statis).
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4 text-xs text-slate-600">
              Pembayaran akan dipotong langsung dari saldo AIDIL STORE kamu.
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={loading}
              className="w-full rounded-2xl bg-gold-600 px-5 py-3 font-black text-white transition hover:bg-gold-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Memproses...' : 'Bayar Sekarang'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/scan-qris')}
              className="w-full rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-500 hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}