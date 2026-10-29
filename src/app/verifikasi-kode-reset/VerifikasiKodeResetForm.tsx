"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import Icon from "@/components/icons/Icon";
import Input from "@/components/ui/Input";
import {
  RESET_CODE_COOLDOWN_SECONDS,
  friendlyPasswordResetError,
  isEmailEnumerationError,
  readResetCooldown,
  startResetCooldown,
} from "@/lib/password-reset";

const CODE_LENGTH = 6;

export default function VerifikasiKodeResetForm() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();
  const searchParams = useSearchParams();
  const email = useMemo(
    () => (searchParams.get("email") || "").trim(),
    [searchParams]
  );
  const hasEmail = email.includes("@");

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(() =>
    hasEmail ? readResetCooldown(email) : 0
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (verifying || !hasEmail) return;

    if (code.length !== CODE_LENGTH) {
      setError(`Masukkan kode verifikasi ${CODE_LENGTH} digit.`);
      return;
    }

    setVerifying(true);
    setError(null);
    setInfo(null);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "recovery",
      });

      if (verifyError) {
        const message = friendlyPasswordResetError(verifyError.message);
        setError(message);
        toast.show(message, "error");
        return;
      }

      setInfo("Kode benar. Mengarahkan ke form password baru...");
      router.replace("/reset-password");
    } catch {
      const message = friendlyPasswordResetError("network");
      setError(message);
      toast.show(message, "error");
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (resending || cooldown > 0 || !hasEmail) return;

    setResending(true);
    setError(null);
    setInfo(null);

    try {
      // Sama seperti permintaan awal: tanpa redirectTo agar Supabase
      // mengirim kode OTP, bukan link halaman reset.
      const { error: resendError } =
        await supabase.auth.resetPasswordForEmail(email);

      if (resendError && !isEmailEnumerationError(resendError.message)) {
        const message = friendlyPasswordResetError(resendError.message);
        setError(message);
        toast.show(message, "error");
        return;
      }

      startResetCooldown(email);
      setCooldown(RESET_CODE_COOLDOWN_SECONDS);
      setInfo("Kode verifikasi baru sudah dikirim ke email Anda.");
    } catch {
      const message = friendlyPasswordResetError("network");
      setError(message);
      toast.show(message, "error");
    } finally {
      setResending(false);
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
          <h1 className="mt-2 text-2xl font-black">Verifikasi kode reset</h1>
          <p className="mt-2 text-sm text-gold-100">
            Kode verifikasi 6 digit sudah dikirim ke email Anda, masukkan kode
            di bawah ini.
          </p>
        </div>

        <div className="p-7 sm:p-8">
          {!hasEmail ? (
            <div className="text-center" role="alert">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app-inset text-2xl font-black text-app-kicker">
                !
              </div>
              <h2 className="mt-4 text-lg font-black text-app-text">
                Email verifikasi tidak ditemukan
              </h2>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                Mulai lagi dari halaman Lupa Password agar kode dikirim ke
                email yang benar.
              </p>
              <Link
                href="/lupa-password"
                className="btn-gold mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-black transition"
              >
                Minta Kode Verifikasi
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="rounded-2xl border border-app-border bg-app-inset px-4 py-3 text-sm text-app-muted">
                  Kode dikirim ke{" "}
                  <span className="font-black text-app-text">{email}</span>.{" "}
                  <Link
                    href="/lupa-password"
                    className="font-bold text-app-kicker hover:underline"
                  >
                    Ubah email
                  </Link>
                </div>

                <Input
                  label="Kode verifikasi"
                  type="text"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH}
                  pattern="[0-9]*"
                  autoFocus
                  value={code}
                  onChange={(e) =>
                    setCode(
                      e.target.value
                        .replace(/\D/g, "")
                        .slice(0, CODE_LENGTH)
                    )
                  }
                  placeholder="••••••"
                  className="text-center text-2xl font-black tracking-[0.45em]"
                  hint={`Masukkan ${CODE_LENGTH} digit angka dari email.`}
                />

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  >
                    {error}
                  </div>
                )}

                {info && (
                  <div
                    role="status"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    {info}
                  </div>
                )}

                <Button type="submit" loading={verifying} className="w-full">
                  Verifikasi
                </Button>
              </form>

              <div className="mt-4 border-t border-app-border pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  loading={resending}
                  disabled={cooldown > 0 || resending}
                  onClick={() => void handleResend()}
                >
                  {cooldown > 0
                    ? `Kirim Ulang Kode (${cooldown}s)`
                    : "Kirim Ulang Kode"}
                </Button>
                <p className="mt-2 text-center text-xs text-app-subtle">
                  Tidak menerima kode? Cek folder spam atau kirim ulang setelah
                  cooldown berakhir.
                </p>
              </div>

              <Link
                href="/login"
                className="mt-5 flex items-center justify-center gap-1.5 text-center text-sm font-bold text-app-kicker hover:underline"
              >
                <Icon name="arrow_left" size={16} /> Kembali ke Login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
