"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Icon from "@/components/icons/Icon";
import Button from "@/components/Button";
import Input from "@/components/ui/Input";
import {
  friendlyPasswordResetError,
  isEmailEnumerationError,
  startResetCooldown,
} from "@/lib/password-reset";

const SENT_MESSAGE =
  "Kode verifikasi 6 digit sudah dikirim ke email Anda, masukkan kode di bawah ini.";

export default function LupaPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    const cleanEmail = email.trim();
    setLoading(true);
    setError(null);

    try {
      // Tanpa redirectTo, Supabase mengirim kode OTP dari template email,
      // bukan link yang langsung membuka halaman reset.
      const { error: resetError } =
        await supabase.auth.resetPasswordForEmail(cleanEmail);

      if (resetError && !isEmailEnumerationError(resetError.message)) {
        const message = friendlyPasswordResetError(resetError.message);
        setError(message);
        toast.show(message, "error");
        return;
      }

      startResetCooldown(cleanEmail);
      toast.show(SENT_MESSAGE, "success");
      router.push(
        `/verifikasi-kode-reset?email=${encodeURIComponent(cleanEmail)}`
      );
    } catch {
      const message = friendlyPasswordResetError("network");
      setError(message);
      toast.show(message, "error");
    } finally {
      setLoading(false);
    }
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
            Masukkan email akun Anda. Kami akan mengirim kode verifikasi 6 digit
            untuk membuat password baru.
          </p>
        </div>

        <div className="p-7 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="nama@email.com"
              hint="Gunakan email yang Anda pakai untuk login."
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
              Kirim Kode Verifikasi
            </Button>
          </form>

          <Link
            href="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-center text-sm font-bold text-app-kicker hover:underline"
          >
            <Icon name="arrow_left" size={16} /> Kembali ke Login
          </Link>
        </div>
      </div>
    </div>
  );
}
