"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";
import Button from "@/components/Button";
import Input from "@/components/ui/Input";
import { humanizeError } from "@/lib/utils";

type Status = "checking" | "ready" | "invalid" | "done";

const INVALID_LINK_MESSAGE =
  "Link reset tidak valid atau sudah kedaluwarsa. Silakan minta link baru.";

function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes("different from the old"))
    return "Password baru harus berbeda dari password lama.";
  if (m.includes("session missing") || m.includes("not authenticated") || m.includes("jwt"))
    return "Sesi reset tidak ditemukan atau sudah berakhir. Silakan minta link baru.";
  if (m.includes("at least") && m.includes("character"))
    return "Password belum memenuhi syarat minimal.";
  if (m.includes("weak") || m.includes("pwned"))
    return "Password terlalu lemah. Gunakan kombinasi huruf, angka, dan simbol.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Terlalu banyak permintaan. Coba lagi beberapa menit lagi.";
  return humanizeError(message);
}

export default function ResetPasswordForm() {
  const supabase = createClient();
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    // Link yang sudah kedaluwarsa/ditolak Supabase membawa parameter error.
    const hasLinkError = Boolean(
      params.get("error") ||
        params.get("error_code") ||
        hash.get("error") ||
        hash.get("error_code")
    );
    if (hasLinkError) {
      setStatus("invalid");
      return;
    }

    const hasRecoveryParams =
      params.has("code") ||
      params.get("type") === "recovery" ||
      hash.has("access_token") ||
      hash.get("type") === "recovery";

    // Flow PKCE memancarkan SIGNED_IN setelah kode ditukar, sedangkan flow
    // implicit memancarkan PASSWORD_RECOVERY. Keduanya sama-sama valid.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || completedRef.current) return;
      if (event === "PASSWORD_RECOVERY" || (session && event !== "SIGNED_OUT")) {
        setStatus("ready");
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) setStatus("ready");
      else if (!hasRecoveryParams) setStatus("invalid");
    });

    timeout = setTimeout(() => {
      if (!active) return;
      setStatus((prev) => (prev === "checking" ? "invalid" : prev));
    }, 10000);

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Token recovery di URL tidak diperlukan lagi setelah sesi terbentuk.
  useEffect(() => {
    if (status !== "ready") return;
    if (window.location.hash || window.location.search.includes("code=")) {
      window.history.replaceState({}, "", "/reset-password");
    }
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    if (password.length < 8) {
      const message = "Password baru minimal 8 karakter.";
      setError(message);
      toast.show(message, "error");
      return;
    }

    if (password !== confirm) {
      const message = "Konfirmasi password tidak sama.";
      setError(message);
      toast.show(message, "error");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setLoading(false);
      const message = friendlyError(updateError.message);
      setError(message);
      toast.show(message, "error");
      return;
    }

    setLoading(false);
    completedRef.current = true;
    setStatus("done");
    toast.show(
      "Password berhasil diubah. Silakan login dengan password baru.",
      "success"
    );

    // Sesi recovery tidak dipakai untuk langsung masuk; akhiri sesi lalu
    // arahkan user ke halaman login.
    await supabase.auth.signOut().catch(() => {});
    setTimeout(() => {
      router.replace("/login");
      router.refresh();
    }, 1500);
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
          <h1 className="mt-2 text-2xl font-black">Buat password baru</h1>
          <p className="mt-2 text-sm text-gold-100">
            Gunakan password yang mudah kamu ingat dan tidak dibagikan kepada
            orang lain.
          </p>
        </div>

        <div className="p-7 sm:p-8">
          {status === "checking" && (
            <div className="py-8 text-center" role="status" aria-live="polite">
              <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-app-border border-t-gold-500" />
              <p className="mt-4 text-sm font-bold text-app-text">
                Memeriksa link reset...
              </p>
              <p className="mt-1 text-xs text-app-muted">Mohon tunggu sebentar.</p>
            </div>
          )}

          {status === "invalid" && (
            <div className="text-center" role="alert">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-app-inset text-2xl font-black text-app-kicker">
                !
              </div>
              <h2 className="mt-4 text-lg font-black text-app-text">
                Link tidak valid
              </h2>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                {INVALID_LINK_MESSAGE}
              </p>
              <Link
                href="/lupa-password"
                className="btn-gold mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-black transition"
              >
                Minta Link Baru
              </Link>
              <Link
                href="/login"
                className="mt-3 block text-sm font-bold text-app-kicker hover:underline"
              >
                ← Kembali ke Login
              </Link>
            </div>
          )}

          {status === "ready" && (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Password baru"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Minimal 8 karakter"
                  hint="Minimal 8 karakter."
                />

                <Input
                  label="Konfirmasi password baru"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Ulangi password baru"
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
                  Simpan Password Baru
                </Button>
              </form>

              <Link
                href="/login"
                className="mt-5 block text-center text-sm font-bold text-app-kicker hover:underline"
              >
                ← Kembali ke Login
              </Link>
            </>
          )}

          {status === "done" && (
            <div className="text-center" role="status" aria-live="polite">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl font-black text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                ✓
              </div>
              <h2 className="mt-4 text-lg font-black text-app-text">
                Password berhasil diubah
              </h2>
              <p className="mt-2 text-sm leading-6 text-app-muted">
                Silakan login dengan password baru. Mengarahkan ke halaman
                login...
              </p>
              <Link
                href="/login"
                className="btn-gold mt-5 inline-flex min-h-[44px] items-center justify-center rounded-xl px-5 py-2.5 text-sm font-black transition"
              >
                Ke Halaman Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
