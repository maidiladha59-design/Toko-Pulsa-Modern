"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AvatarRing from "@/components/profile/AvatarRing";
import GreetingText from "@/components/profile/GreetingText";
import KycChip from "@/components/profile/KycChip";
import LevelChip from "@/components/profile/LevelChip";
import AvatarPicker from "@/components/AvatarPicker";
import Icon from "@/components/icons/Icon";
import { useToast } from "@/components/ToastProvider";
import { formatRupiah } from "@/lib/utils";
import { KYC_VERIFY_HINT, kycUiStatus } from "@/lib/labels";

// Kunci localStorage: pilihan sembunyikan saldo bertahan antar kunjungan.
const BALANCE_HIDDEN_KEY = "aidilstore_balance_hidden";

function EyeToggle({ hidden }: { hidden: boolean }) {
  if (!hidden) return <Icon name="eye" size={13} />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={13}
      height={13}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.9 10.9 0 0 1 12 5c5 0 9 4.5 9 7 0 .9-.9 2.4-2.4 3.7M6.1 6.3C4.2 7.8 3 9.6 3 12c0 2 4 7 9 7 1.6 0 3-.4 4.2-1" />
    </svg>
  );
}

export default function ProfileHeader({
  name,
  avatarId,
  avatarUrl,
  kycStatus,
  balance,
  transactions,
  accountId,
}: {
  name: string;
  avatarId: string | null;
  avatarUrl: string | null;
  /** Status mentah public.kyc_verifications.status, null bila gagal dimuat. */
  kycStatus: string | null;
  balance: number | null;
  transactions: number;
  accountId: string;
}) {
  const toast = useToast();
  const [current, setCurrent] = useState({ id: avatarId, url: avatarUrl });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setCurrent({ id: avatarId, url: avatarUrl });
  }, [avatarId, avatarUrl]);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(BALANCE_HIDDEN_KEY) === "1");
    } catch {
      // Mode privat / storage diblokir: saldo tetap tampil.
    }
  }, []);

  const status = kycUiStatus(kycStatus);
  const shortId = accountId ? accountId.replaceAll("-", "").slice(0, 8).toUpperCase() : "";

  function toggleBalance() {
    setHidden((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(BALANCE_HIDDEN_KEY, next ? "1" : "0");
      } catch {
        // Pilihan tetap berlaku di sesi ini walau tidak bisa disimpan.
      }
      return next;
    });
  }

  async function copyId() {
    if (!shortId) return;
    try {
      await navigator.clipboard.writeText(shortId);
      toast.show("ID disalin", "success");
    } catch {
      toast.show("Gagal menyalin ID. Coba lagi.", "error");
    }
  }

  return (
    <>
      <div className="flex w-full min-w-0 max-w-full flex-wrap items-start gap-3 sm:flex-nowrap sm:gap-4">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Ganti foto profil"
          className="relative shrink-0 rounded-full transition hover:opacity-90"
        >
          <AvatarRing
            size={60}
            src={current.url}
            name={name}
            status={status ?? "unverified"}
            gap="hero"
            priority
          />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-gold-400/60 bg-zinc-900 text-gold-200 shadow-sm"
          >
            <Icon name="edit" size={13} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <GreetingText className="block text-xs font-semibold text-gold-200" />
          <div className="mt-1 min-w-0">
            <p className="block truncate text-[18px] font-semibold leading-6 text-white" title={name}>
              {name}
            </p>
          </div>

          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            {status ? <KycChip status={status} tone="hero" /> : null}
            <LevelChip transactions={transactions} />
            {shortId ? (
              <button
                type="button"
                onClick={copyId}
                aria-label={`Salin ID ${shortId}`}
                className="inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 text-[11px] font-semibold leading-4 text-zinc-200 transition hover:bg-white/15"
              >
                <span className="truncate tabular-nums">ID {shortId}</span>
                <Icon name="copy" size={11} className="shrink-0" />
              </button>
            ) : null}
          </div>

          {status === "unverified" ? (
            <p className="mt-1.5 max-w-full text-[11px] leading-4 text-zinc-400">{KYC_VERIFY_HINT}</p>
          ) : null}
        </div>

        {balance === null ? (
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 sm:w-48" aria-hidden>
            <span className="block h-2.5 w-10 animate-pulse rounded bg-white/15" />
            <span className="mt-2 block h-6 w-24 animate-pulse rounded bg-white/15" />
          </div>
        ) : (
          <div className="w-full shrink-0 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 sm:w-48">
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Saldo</span>
              <button
                type="button"
                onClick={toggleBalance}
                aria-label={hidden ? "Tampilkan saldo" : "Sembunyikan saldo"}
                className="-mr-1 shrink-0 rounded-full p-1 text-zinc-300 transition hover:text-white"
              >
                <EyeToggle hidden={hidden} />
              </button>
            </div>
            <Link
              href="/wallet"
              className="mt-1 block truncate text-xl font-black leading-7 tabular-nums text-white sm:text-right sm:text-2xl"
            >
              {hidden ? "Rp ••••" : formatRupiah(balance)}
            </Link>
          </div>
        )}
      </div>

      <AvatarPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentAvatarId={current.id}
        kycStatus={status ?? "unverified"}
        onSaved={({ avatar_id, image_url }) => setCurrent({ id: avatar_id, url: image_url })}
      />
    </>
  );
}
