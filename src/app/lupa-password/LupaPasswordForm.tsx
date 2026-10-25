"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import Input from "@/components/ui/Input";
import { humanizeError } from "@/lib/utils";

const SUCCESS_MESSAGE =
  "Kalau email terdaftar, link reset sudah dikirim. Silakan cek inbox atau folder spam.";

// Supabase bisa membalas "User not found" bila proteksi enumerasi email aktif.
// Balasan itu tetap diperlakukan sebagai sukses agar status pendaftaran email
// tidak bisa ditebak dari halaman ini.
function isEnumerationError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("user not found") ||
    m.includes("email not found") ||
    m.includes("not registered")
  );
}

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many") || m.includes("email rate"))
    return "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.";
  return humanizeError(message);
}

export default function LupaPasswordForm() {
  const supabase = createClient();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setError(null);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    setLoading(false);

    if (resetError && !isEnumerationError(resetError.message)) {
      const message = friendlyError(resetError.message);
      setError(message);
      toast.show(message, "error");
      return;
    }

    setSent(true);
    toast.show(SUCCESS_MESSAGE, "success");
  }

  return (
    <div className="mx-auto max-w-md animate-page-in pb-24 md:pb-0">
      <div className="overflow-hidden rounded-[2rem] border border-app-border bg-app-surface shadow-xl shadow-zinc-950/10">
        <div className="bg-gradient-to-br from-black via-zinc-950 to-zinc-950 p-7 text-white">
          <Image
            src="/aidil-logo.png"
            alt="Aidil Store"
            width={48}
            height={48}
            className="h-12 w-12 rounded-2xl bg-white p-2"
          />
          <p className="mt-5 text-xs font-black uppercase tracking-[.2em] text-gold-200">
            AIDIL STORE
          </p>
          <h1 className="mt-2 text-2xl font-black">Lupa password?</h1>
          <p className="mt-2 text-sm text-gold-100">
            Masukkan email akunmu. Kami akan mengirim tautan untuk membuat
            password baru.
          </p>
        </div>

        <div className="p-7 sm:p-8">
          {sent ? (
            <div
              role="status"
              className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <p className="font-black">Permintaan diterima</p>
              <p className="mt-2">{SUCCESS_MESSAGE}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="nama@email.com"
                hint="Gunakan email yang kamu pakai untuk login."
              />

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                >
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full">
                Kirim Link Reset
              </Button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-5 block text-center text-sm font-bold text-app-kicker hover:underline"
          >
            ← Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  );
}
