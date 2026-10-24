import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessIdentity } from "@/lib/business";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import SignOutButton from "./SignOutButton";
import ForceSignOut from "./ForceSignOut";

export const metadata = {
  title: "Akun Diblokir — AIDIL STORE",
};

export default async function BlockedAccountPage({
  searchParams,
}: {
  searchParams?: { reason?: string | string[] };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let blockedReason: string | null = null;
  let blockedAt: string | null = null;
  let isBlocked = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("account_status, blocked_at, blocked_reason")
      .eq("id", user.id)
      .maybeSingle();

    if (profile && profile.account_status !== "BLOCKED") {
      redirect("/dashboard");
    }

    isBlocked = profile?.account_status === "BLOCKED";
    blockedReason = profile?.blocked_reason ?? null;
    blockedAt = profile?.blocked_at ?? null;
  }

  const reasonFromQuery =
    typeof searchParams?.reason === "string" ? searchParams.reason.slice(0, 300) : null;
  const displayReason = blockedReason || reasonFromQuery;

  const biz = await getBusinessIdentity();
  const phoneHref = biz.phone ? `tel:${biz.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <div className="mx-auto max-w-lg animate-page-in py-6">
      {isBlocked && <ForceSignOut />}
      <Card className="p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <Image
            src="/aidil-logo.png"
            alt="AIDIL STORE"
            width={44}
            height={44}
            className="h-11 w-11 rounded-xl bg-white p-1.5 shadow-sm"
          />
          <div>
            <p className="text-sm font-black text-app-text">AIDIL STORE</p>
            <p className="text-xs text-app-kicker">Solusi Digital</p>
          </div>
        </div>

        <div className="mx-auto mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-danger-100 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </div>

        <h1 className="mt-5 text-center text-2xl font-black text-app-text">Akun Diblokir</h1>
        <p className="mt-2 text-center text-sm leading-6 text-app-muted">
          Akun ini sedang diblokir, sehingga tidak dapat digunakan untuk login maupun melakukan
          transaksi.
        </p>

        <div className="mt-6 rounded-2xl border border-danger-500/30 bg-danger-500/10 px-4 py-3">
          <p className="text-xs font-black uppercase tracking-widest text-danger-600 dark:text-danger-400">
            Alasan Blokir
          </p>
          <p className="mt-1 text-sm font-medium text-app-text">
            {displayReason ||
              "Belum ada alasan yang dicatat. Silakan hubungi CS untuk informasi lebih lanjut."}
          </p>
          {blockedAt && (
            <p className="mt-2 text-xs text-app-subtle">Diblokir sejak {formatDate(blockedAt)}</p>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-app-border bg-app-inset p-4">
          <p className="text-sm font-black text-app-text">Butuh bantuan?</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            Jika kamu merasa blokir ini keliru atau ingin mengajukan peninjauan, hubungi CS AIDIL
            STORE:
          </p>
          <div className="mt-3 space-y-1.5 text-sm font-bold">
            {biz.email ? (
              <a href={`mailto:${biz.email}`} className="block text-app-kicker hover:underline">
                {biz.email}
              </a>
            ) : null}
            {biz.phone ? (
              <a href={phoneHref || undefined} className="block text-app-kicker hover:underline">
                {biz.phone}
              </a>
            ) : null}
            {!biz.email && !biz.phone ? (
              <p className="text-sm text-app-muted">
                Kontak CS belum tersedia. Silakan hubungi admin melalui kanal resmi AIDIL STORE.
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-app-border px-4 py-2.5 text-sm font-bold text-app-text transition hover:border-gold-400 hover:bg-app-accent-soft"
          >
            Kembali ke Beranda
          </Link>
          {user ? (
            <SignOutButton />
          ) : (
            <Link
              href="/login"
              className="btn-gold inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-bold transition"
            >
              Kembali ke Login
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
