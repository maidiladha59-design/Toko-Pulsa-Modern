'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatRupiah } from '@/lib/utils';
import Icon from '@/components/icons/Icon';

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
      // yang sudah/akan Anda buat di backend (potong saldo wallet + kirim ke payment gateway).
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
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-4">
        <div className="w-full max-w-md rounded-3xl bg-app-surface p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-300">
            <Icon name="check_circle" size={30} />
          </div>
          <h1 className="text-xl font-black text-app-text">Pembayaran Berhasil</h1>
          <p className="mt-2 text-sm text-app-muted">
            Pembayaran ke {payment.merchantName} sebesar Rp{' '}
            {formatRupiah(Number(payment.amount))} berhasil diproses.
          </p>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="btn-gold mt-6 w-full rounded-xl px-4 py-3 text-sm font-black"
          >
            Kembali ke Beranda
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-app-bg px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="overflow-hidden rounded-3xl bg-app-surface shadow-xl">
          <div className="bg-slate-950 px-6 py-6 text-white">
            <h1 className="text-2xl font-bold">Konfirmasi Pembayaran</h1>
            <p className="mt-1 text-sm text-slate-300">
              Periksa detail sebelum melanjutkan.
            </p>
          </div>

          <div className="space-y-5 p-6">
            <div className="rounded-2xl border border-app-border bg-app-inset p-5">
              <p className="text-xs font-medium uppercase text-app-muted">Merchant</p>
              <p className="mt-1 text-lg font-bold text-app-text">{payment.merchantName}</p>

              <p className="mt-4 text-xs font-medium uppercase text-app-muted">
                Total Pembayaran
              </p>
              <p className="mt-1 text-3xl font-black text-app-text">
                {formatRupiah(Number(payment.amount))}
              </p>

              {payment.isStatic && (
                <p className="mt-2 text-xs text-app-muted">
                  Nominal ini Anda masukkan sendiri (QRIS statis).
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-gold-400/40 bg-app-accent-soft p-4 text-xs text-app-muted">
              Pembayaran akan dipotong langsung dari saldo AIDIL STORE Anda.
            </div>

            {error && (
              <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 p-3 text-sm text-danger-700 dark:text-danger-300">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleConfirmPayment}
              disabled={loading}
              className="btn-gold w-full rounded-2xl px-5 py-3 font-black transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Memproses...' : 'Bayar Sekarang'}
            </button>

            <button
              type="button"
              onClick={() => router.push('/scan-qris')}
              className="w-full rounded-2xl border border-app-border px-5 py-3 text-sm font-semibold text-app-muted hover:bg-app-inset"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}