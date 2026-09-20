"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { humanizeError } from "@/lib/utils";

export default function AdminLoginPage() {
  const supabase = createClient(); const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [showPassword, setShowPassword] = useState(false); const [remember, setRemember] = useState(true); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const [step, setStep] = useState<"password" | "otp">("password");
  const [otp, setOtp] = useState(""); const [otpLoading, setOtpLoading] = useState(false); const [otpError, setOtpError] = useState(""); const [otpSentTo, setOtpSentTo] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null); const [now, setNow] = useState(() => Date.now());
  const autoRequested = useRef(false);
  useEffect(() => { setRemember(localStorage.getItem("aidil_admin_remember") !== "0"); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // Kalau sudah pernah login password (sesi Supabase masih ada) tapi belum lolos OTP 2FA,
  // langsung lompat ke langkah OTP tanpa minta password lagi.
  useEffect(() => {
    (async () => {
      if (autoRequested.current) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
      if (!isAdmin) return;
      autoRequested.current = true;
      await requestOtp(user.email || "");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestOtp(userEmail: string) {
    setOtpError(""); setOtpLoading(true);
    try {
      const res = await fetch("/api/auth/admin/send-otp", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setOtpError(json?.message || "Gagal mengirim OTP."); setStep("otp"); setOtpSentTo(userEmail); return; }
      setStep("otp"); setOtpSentTo(userEmail || json?.email || "");
      setResendAvailableAt(Date.now() + (json?.resendAfter || 60) * 1000);
    } catch {
      setOtpError("Gagal mengirim OTP. Periksa koneksi internet."); setStep("otp");
    } finally { setOtpLoading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) { setError(humanizeError(loginError.message)); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Sesi login tidak ditemukan. Silakan coba lagi."); return; }
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profileError) { console.error(profileError); await supabase.auth.signOut(); setError("Profil admin belum tersedia atau gagal dibaca. Pastikan data profile akun ini sudah dibuat di Supabase."); return; }
      const isAdmin = profile?.role === "ADMIN" || profile?.role === "SUPER_ADMIN";
      if (!isAdmin) { await supabase.auth.signOut(); setError("Akun ini bukan akun admin."); return; }
      localStorage.setItem("aidil_admin_remember", remember ? "1" : "0");
      autoRequested.current = true;
      await requestOtp(user.email || email);
    } catch (err) {
      console.error(err); setError("Terjadi kesalahan saat login. Periksa koneksi internet lalu coba lagi.");
    } finally { setLoading(false); }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault(); setOtpLoading(true); setOtpError("");
    try {
      const res = await fetch("/api/auth/admin/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setOtpError(json?.message || "OTP salah."); return; }
      router.replace("/admin"); router.refresh();
    } catch {
      setOtpError("Gagal memverifikasi OTP. Periksa koneksi internet.");
    } finally { setOtpLoading(false); }
  }

  const resendRemaining = resendAvailableAt ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000)) : 0;

  if (step === "otp") {
    return (
      <main className="flex min-h-[78vh] items-center justify-center py-6 animate-page-in">
        <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-zinc-950/10 sm:p-10">
          <span className="inline-flex rounded-full bg-gold-50 px-3 py-1 text-xs font-black text-gold-700">🔐 Verifikasi 2 Langkah</span>
          <h2 className="mt-3 text-2xl font-black text-slate-900">Masukkan Kode OTP</h2>
          <p className="mt-1 text-sm text-slate-500">Kode 6 digit sudah dikirim ke email admin{otpSentTo ? <> <b className="text-slate-800">{otpSentTo}</b></> : null}. Berlaku 5 menit.</p>
          <form onSubmit={submitOtp} className="mt-6 space-y-4">
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="••••••" required className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-2xl font-black tracking-[.5em] outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" />
            {otpError && <div className="animate-page-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-5 text-red-700">{otpError}</div>}
            <button disabled={otpLoading || otp.length !== 6} className="w-full rounded-xl bg-gradient-to-r from-gold-600 to-gold-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-gold-500/20 transition hover:-translate-y-0.5 hover:from-gold-700 hover:to-zinc-900 disabled:cursor-not-allowed disabled:opacity-60">{otpLoading ? "Memeriksa..." : "Verifikasi & Masuk"}</button>
          </form>
          <button type="button" disabled={resendRemaining > 0 || otpLoading} onClick={() => requestOtp(otpSentTo)} className="mt-4 w-full text-center text-sm font-semibold text-gold-600 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline">
            {resendRemaining > 0 ? `Kirim ulang OTP (${resendRemaining}s)` : "Kirim ulang OTP"}
          </button>
          <div className="mt-6 border-t border-slate-100 pt-5 text-center text-sm">
            <button type="button" onClick={async () => { await supabase.auth.signOut(); setStep("password"); setOtp(""); setOtpError(""); }} className="font-medium text-slate-500 hover:text-gold-600">← Ganti akun / login ulang</button>
          </div>
        </div>
      </main>
    );
  }

  return <main className="flex min-h-[78vh] items-center justify-center py-6 animate-page-in"><div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-zinc-950/10 md:grid-cols-2"><div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-zinc-950 to-gold-700 p-10 text-white md:block"><div className="auth-orb absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold-400/20 blur-3xl" /><div className="relative z-10"><img src="/aidil-logo.png" alt="Aidil Store" className="h-14 w-14 rounded-2xl bg-white p-2 shadow-xl" /><p className="mt-8 text-xs font-black uppercase tracking-[.22em] text-gold-200">AIDIL STORE · ADMIN</p><h1 className="mt-2 text-4xl font-black">Kelola toko dengan mudah.</h1><p className="mt-4 text-sm leading-6 text-gold-100">Pantau produk, order, pengguna, saldo dan verifikasi Top Up dari satu dashboard.</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs font-bold"><span className="rounded-xl bg-white/10 p-3">📦 Produk</span><span className="rounded-xl bg-white/10 p-3">💰 Top Up</span></div></div></div><div className="p-6 sm:p-10"><div className="flex items-center gap-3 md:hidden"><img src="/aidil-logo.png" alt="Aidil Store" className="h-12 w-12 rounded-xl" /><div><p className="font-black">AIDIL STORE</p><p className="text-xs text-slate-500">Admin Panel</p></div></div><div className="mt-7 md:mt-0"><span className="inline-flex rounded-full bg-gold-50 px-3 py-1 text-xs font-black text-gold-700">🔐 Area Admin · Login 2 Langkah</span><h2 className="mt-3 text-2xl font-black text-slate-900">Masuk sebagai Admin</h2><p className="mt-1 text-sm text-slate-500">Gunakan akun admin yang terdaftar di Supabase. Setelah password benar, kode OTP akan dikirim ke email.</p></div><form onSubmit={submit} className="mt-7 space-y-5"><label className="block"><span className="text-sm font-semibold text-slate-700">Email Admin</span><input value={email} onChange={e => setEmail(e.target.value)} type="email" required autoComplete="username" placeholder="admin@email.com" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" /></label><label className="block"><span className="text-sm font-semibold text-slate-700">Password</span><span className="relative mt-2 block"><input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Masukkan password" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-16 text-sm outline-none transition focus:border-gold-500 focus:bg-white focus:ring-4 focus:ring-gold-100" /><button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200">{showPassword ? "Sembunyi" : "Lihat"}</button></span></label><div className="flex items-center justify-between gap-3 text-sm"><label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Ingat pilihan</label><Link href="/forgot-password" className="font-semibold text-gold-600 hover:underline">Lupa password?</Link></div>{error && <div className="animate-page-in rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium leading-5 text-red-700">{error}</div>}<button disabled={loading} className="w-full rounded-xl bg-gradient-to-r from-gold-600 to-gold-700 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-gold-500/20 transition hover:-translate-y-0.5 hover:from-gold-700 hover:to-zinc-900 disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Memeriksa akun..." : "Lanjut ke Verifikasi OTP"}</button></form><div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5 text-sm"><Link href="/" className="font-medium text-slate-500 hover:text-gold-600">← Kembali ke toko</Link><Link href="/login" className="font-semibold text-gold-600 hover:underline">Login pengguna</Link></div></div></div></main>;
}
