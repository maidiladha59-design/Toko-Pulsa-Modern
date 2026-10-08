"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import { humanizeError } from "@/lib/utils";

function LoginForm() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();

  const rawRedirectTo = searchParams.get("redirectTo") || searchParams.get("next");
  const redirectTo =
    rawRedirectTo &&
    rawRedirectTo.startsWith("/") &&
    !rawRedirectTo.startsWith("//")
      ? rawRedirectTo
      : "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      const humanized = humanizeError(error.message);
      const msg =
        humanized === "Terjadi kesalahan. Silakan coba lagi."
          ? "Login gagal. Silakan periksa koneksi atau data Anda kembali."
          : humanized;
      setError(msg);
      toast.show(msg, "error");
      return;
    }

    toast.show("Login berhasil.", "success");
    toast.show("Login berhasil.", "success");
    void fetch("/api/notifications/login-event", { method: "POST" }).catch(() => {});
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[2rem] border border-gold-400/20 bg-zinc-950 shadow-2xl shadow-black/50 animate-page-in md:grid-cols-2">

      {/* LEFT - BRANDING */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-zinc-950 to-zinc-950 p-10 text-white md:block">

        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-yellow-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-gold-500/25 blur-3xl" />

        <div className="relative z-10 flex h-full flex-col justify-between">

          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/aidil-logo.png"
                alt="Aidil Store"
                width={56}
                height={56}
                className="h-14 w-14 rounded-2xl bg-white p-2 shadow-xl"
              />

              <div>
                <p className="text-sm font-black tracking-wide">
                  AIDIL STORE
                </p>
                <p className="text-xs text-yellow-300">
                  Solusi Digital
                </p>
              </div>
            </div>

            <p className="mt-10 text-xs font-black uppercase tracking-[.22em] text-yellow-300">
              SELAMAT DATANG KEMBALI
            </p>

            <h1 className="mt-3 text-4xl font-black leading-tight">
              Login dan lanjutkan
              <span className="text-yellow-300"> perjalananmu.</span>
            </h1>

            <p className="mt-5 max-w-sm text-sm leading-6 text-zinc-300">
              Masuk ke akun AIDIL STORE untuk mengakses pesanan,
              produk digital, saldo, dan berbagai fitur akunmu.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-sm font-black text-yellow-300">
              📖 Panduan Login
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-black text-black">
                  1
                </span>
                <p className="text-xs leading-5 text-zinc-300">
                  Masukkan email yang sudah terdaftar.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold-500 text-xs font-black text-white">
                  2
                </span>
                <p className="text-xs leading-5 text-zinc-300">
                  Masukkan password akunmu dengan benar.
                </p>
              </div>

              <div className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-xs font-black text-black">
                  3
                </span>
                <p className="text-xs leading-5 text-zinc-300">
                  Klik Login dan kamu akan diarahkan ke akunmu.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* RIGHT - LOGIN FORM */}
      <div className="p-6 sm:p-9">

        <div className="mb-6 flex rounded-2xl bg-black p-1 text-sm font-bold">
          <Link
            href="/login"
            className="flex-1 rounded-xl bg-yellow-400 px-4 py-2.5 text-center text-black shadow-sm transition hover:bg-yellow-300"
          >
            Login
          </Link>

          <Link
            href="/register"
            className="flex-1 rounded-xl px-4 py-2.5 text-center text-white transition hover:bg-zinc-950"
          >
            Daftar
          </Link>
        </div>

        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[.18em] text-gold-400">
            AIDIL STORE
          </p>

          <h2 className="mt-2 text-2xl font-black text-white">
            Masuk ke akunmu
          </h2>

          <p className="mt-1 text-sm text-white/50">
            Gunakan email dan password yang sudah terdaftar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          <label className="block">
            <span className="text-sm font-bold text-white/80">
              Email
            </span>

            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="nama@email.com"
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-gold-400 focus:bg-white/10 focus:ring-4 focus:ring-gold-400/20"
            />
          </label>

          <label className="block">
            <span className="flex items-center justify-between text-sm font-bold text-white/80">
              <span>Password</span>

              <Link
                href="/forgot-password"
                className="text-xs font-bold text-gold-600 hover:text-zinc-900 hover:underline"
              >
                Lupa password?
              </Link>
            </span>

            <span className="relative mt-2 block">
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Masukkan password"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 pr-20 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-gold-400 focus:bg-white/10 focus:ring-4 focus:ring-gold-400/20"
              />

              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-bold text-white/50 transition hover:bg-white/10 hover:text-gold-300"
              >
                {showPassword ? "Sembunyi" : "Lihat"}
              </button>
            </span>
          </label>

          {error && (
            <div className="animate-page-in rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
              {error}
            </div>
          )}

          <Button
            type="submit"
            loading={loading}
            className="w-full !bg-yellow-400 !text-black hover:!bg-yellow-300"
          >
            Login ke AIDIL STORE
          </Button>
        </form>

        <div className="mt-7 rounded-2xl border border-gold-400/20 bg-white/5 p-5">
          <p className="text-sm font-black text-white">
            Belum punya akun?
          </p>

          <p className="mt-1 text-xs leading-5 text-white/60">
            Yuk buat akun AIDIL STORE dan nikmati pengalaman
            menggunakan layanan digital dengan lebih mudah.
          </p>

          <Link
            href="/register"
            className="mt-4 flex w-full items-center justify-center rounded-xl bg-gold-700 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-900"
          >
            ✨ Buat Akun Sekarang
          </Link>
        </div>

        <p className="mt-5 text-center text-xs text-white/40">
          Dengan login, kamu dapat mengakses fitur akun dan
          layanan AIDIL STORE.
        </p>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md animate-pulse rounded-3xl bg-zinc-950 p-8 text-white/60 shadow-sm">
          Memuat halaman login...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}