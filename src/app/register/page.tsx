"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import { humanizeError } from "@/lib/utils";
import { useToast } from "@/components/ToastProvider";

const TERMS_SHORT =
  "AIDIL STORE menyediakan produk digital, PPOB, saldo, pembayaran dan layanan terkait. Pengguna wajib memberikan data yang benar, menjaga akun dan mengikuti ketentuan provider.";

const PRIV_SHORT =
  "Data akun, transaksi, kontak dan data yang diperlukan untuk keamanan diproses untuk menyediakan layanan. Dokumen KYC disimpan privat dan digunakan untuk verifikasi.";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function RegisterForm() {
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const referralCode = useMemo(
    () => searchParams.get("ref") || "",
    [searchParams]
  );

  useEffect(() => {
    if (!otpSent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [otpSent]);

  const otpRemaining = otpExpiresAt
    ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000))
    : 0;
  const resendRemaining = resendAvailableAt
    ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000))
    : 0;

  useEffect(() => {
    if (otpSent && otpExpiresAt && otpRemaining === 0 && !emailVerified) {
      setOtpSent(false);
      setOtp("");
      setError("OTP sudah kedaluwarsa. Silakan kirim OTP baru.");
    }
  }, [otpSent, otpExpiresAt, otpRemaining, emailVerified]);

  function resetEmailVerification() {
    setOtp("");
    setOtpSent(false);
    setEmailVerified(false);
    setOtpExpiresAt(null);
    setResendAvailableAt(null);
  }

  function handleEmailChange(value: string) {
    const next = value.toLowerCase();
    if (next !== email) resetEmailVerification();
    setEmail(next);
    setError(null);
  }

  async function sendOtp() {
    setError(null);
    const cleanEmail = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }

    setSendingOtp(true);

    try {
      const response = await fetch("/api/auth/register/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429 && data.retryAfter) {
          setResendAvailableAt(Date.now() + data.retryAfter * 1000);
        }
        throw new Error(data.message || "Gagal mengirim OTP.");
      }

      const nowValue = Date.now();
      setOtpSent(true);
      setOtp("");
      setEmailVerified(false);
      setOtpExpiresAt(nowValue + (data.expiresIn || 300) * 1000);
      setResendAvailableAt(nowValue + (data.resendAfter || 60) * 1000);
      toast.show("OTP berhasil dibuat. Untuk development, cek terminal server.", "success");
    } catch (err: any) {
      const msg = humanizeError(err?.message || "Gagal mengirim OTP.");
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyOtp() {
    setError(null);

    if (!/^\d{6}$/.test(otp)) {
      setError("Masukkan OTP 6 digit.");
      return;
    }

    setVerifyingOtp(true);

    try {
      const response = await fetch("/api/auth/register/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "OTP tidak valid.");
      }

      setEmailVerified(true);
      setOtpSent(false);
      toast.show("Email berhasil diverifikasi.", "success");
    } catch (err: any) {
      const msg = humanizeError(err?.message || "OTP tidak valid.");
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailVerified) {
      setError("Verifikasi email dengan OTP terlebih dahulu.");
      return;
    }

    if (password.length < 6) {
      setError("Password minimal 6 karakter.");
      return;
    }

    if (!terms) {
      setError("Centang persetujuan setelah membaca ringkasan ketentuan dan privasi.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          password,
          terms,
          referralCode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Pendaftaran gagal.");
      }

      toast.show("Akun berhasil dibuat. Silakan login.", "success");
      router.replace("/login");
      router.refresh();
    } catch (err: any) {
      const msg = humanizeError(err?.message || "Pendaftaran gagal.");
      setError(msg);
      toast.show(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-2xl shadow-zinc-950/20 animate-page-in md:grid-cols-2">
      <div className="order-2 p-6 sm:p-9 md:order-1">
        <div className="mb-6 flex rounded-2xl bg-black p-1 text-sm font-bold">
          <Link href="/login" className="flex-1 rounded-xl px-4 py-2.5 text-center text-white transition hover:bg-zinc-950">
            Login
          </Link>
          <Link href="/register" className="flex-1 rounded-xl bg-yellow-400 px-4 py-2.5 text-center text-black shadow-sm transition hover:bg-yellow-300">
            Daftar
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[.18em] text-gold-600">AIDIL STORE</p>
          <h1 className="mt-2 text-2xl font-black text-black sm:text-3xl">Buat akun baru ✨</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Yuk buat akun AIDIL STORE dan mulai gunakan berbagai layanan digital dengan mudah.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">Nama Lengkap</span>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" placeholder="Masukkan nama lengkap" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Email</span>
            <div className="mt-2 flex gap-2">
              <input type="email" required value={email} onChange={(e) => handleEmailChange(e.target.value)} disabled={emailVerified} autoComplete="email" placeholder="nama@email.com" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100 disabled:bg-emerald-50" />
              {!emailVerified && (
                <button type="button" onClick={sendOtp} disabled={sendingOtp || resendRemaining > 0 || !email.trim()} className="shrink-0 rounded-xl bg-gold-700 px-3 py-3 text-xs font-black text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4">
                  {sendingOtp ? "Mengirim..." : resendRemaining > 0 ? `${resendRemaining}s` : otpSent ? "Kirim Lagi" : "Kirim OTP"}
                </button>
              )}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">OTP 6 digit berlaku 5 menit.</p>
          </label>

          {otpSent && !emailVerified && (
            <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-black text-slate-800">Kode OTP</span>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-gold-700">{formatTime(otpRemaining)}</span>
              </div>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-3 w-full rounded-xl border border-gold-200 bg-white px-4 py-3 text-center text-2xl font-black tracking-[.45em] outline-none focus:border-gold-500 focus:ring-4 focus:ring-gold-100" />
              <button type="button" onClick={verifyOtp} disabled={verifyingOtp || otp.length !== 6} className="mt-3 w-full rounded-xl bg-gold-700 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50">
                {verifyingOtp ? "Memverifikasi..." : "Verifikasi OTP"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-500">Resend tersedia {resendRemaining > 0 ? `dalam ${resendRemaining} detik` : "sekarang"}.</p>
            </div>
          )}

          {emailVerified && (
            <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div>
                <p className="text-sm font-black text-emerald-800">✓ Email terverifikasi</p>
                <p className="mt-1 text-xs text-emerald-700">Email ini sudah berhasil diverifikasi.</p>
              </div>
              <button type="button" onClick={() => { setEmailVerified(false); setEmail(""); resetEmailVerification(); }} className="text-xs font-bold text-emerald-700 hover:underline">Ganti</button>
            </div>
          )}

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Nomor WhatsApp</span>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="08xxxxxxxxxx" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">Password</span>
            <span className="relative mt-2 block">
              <input type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="Minimal 6 karakter" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-20 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 transition hover:bg-gold-100 hover:text-gold-700">{showPassword ? "Sembunyi" : "Lihat"}</button>
            </span>
          </label>

          <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-center justify-between gap-3"><b className="text-sm text-black">📋 Ketentuan Layanan</b><Link href="/terms" target="_blank" className="text-xs font-black text-gold-700 hover:underline">Baca selengkapnya</Link></div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{TERMS_SHORT}</p>
          </div>

          <div className="rounded-2xl border border-gold-200 bg-gold-50 p-4">
            <div className="flex items-center justify-between gap-3"><b className="text-sm text-black">🔐 Kebijakan Privasi</b><Link href="/privacy" target="_blank" className="text-xs font-black text-gold-700 hover:underline">Baca selengkapnya</Link></div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{PRIV_SHORT}</p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 transition hover:border-gold-300">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-gold-600" />
            <span className="leading-5">Saya menyetujui ringkasan Ketentuan Layanan dan Kebijakan Privasi AIDIL STORE.</span>
          </label>

          {error && <div className="animate-page-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

          <Button type="submit" loading={loading} disabled={!emailVerified || loading} className="w-full !bg-yellow-400 !text-black hover:!bg-yellow-300 disabled:!bg-slate-200 disabled:!text-slate-400">Daftar Sekarang</Button>
        </form>

        <div className="mt-7 rounded-2xl border border-gold-100 bg-gradient-to-r from-yellow-50 to-gold-50 p-5">
          <p className="text-sm font-black text-black">Sudah punya akun?</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Tidak perlu membuat akun baru. Silakan login menggunakan email dan password yang sudah terdaftar.</p>
          <Link href="/login" className="mt-4 flex w-full items-center justify-center rounded-xl bg-gold-700 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-900">🔐 Login ke AIDIL STORE</Link>
        </div>
      </div>

      <div className="relative order-1 hidden overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-zinc-950 p-10 text-white md:order-2 md:block">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gold-500/25 blur-3xl" />
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div>
            <div className="flex items-center gap-3"><img src="/aidil-logo.png" alt="Aidil Store" className="h-14 w-14 rounded-2xl bg-white p-2 shadow-xl" /><div><p className="text-sm font-black tracking-wide">AIDIL STORE</p><p className="text-xs text-yellow-300">Solusi Digital</p></div></div>
            <p className="mt-10 text-xs font-black uppercase tracking-[.22em] text-yellow-300">MULAI SEKARANG</p>
            <h2 className="mt-3 text-4xl font-black leading-tight">Buat akun dan <span className="text-yellow-300">nikmati kemudahannya.</span></h2>
            <p className="mt-5 text-sm leading-6 text-zinc-300">Dengan akun AIDIL STORE, kamu dapat mengakses berbagai layanan digital dalam satu tempat.</p>
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-sm font-black text-yellow-300">📖 Panduan Pendaftaran</p>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-black text-black">1</span><div><p className="text-sm font-bold text-white">Isi data akun</p><p className="mt-1 text-xs leading-5 text-zinc-400">Masukkan nama, email, nomor WhatsApp dan password.</p></div></div>
              <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-600 text-xs font-black text-white">2</span><div><p className="text-sm font-bold text-white">Verifikasi email</p><p className="mt-1 text-xs leading-5 text-zinc-400">Masukkan OTP 6 digit yang berlaku selama 5 menit.</p></div></div>
              <div className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-black text-black">3</span><div><p className="text-sm font-bold text-white">Daftar sekarang</p><p className="mt-1 text-xs leading-5 text-zinc-400">Akun baru dibuat setelah email berhasil diverifikasi.</p></div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}