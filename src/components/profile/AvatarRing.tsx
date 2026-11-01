"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { DEFAULT_AVATAR_URL } from "@/lib/avatar";
import { useLevelKyc } from "@/components/settings/LevelKycProvider";
import VerifiedBadge from "@/components/icons/VerifiedBadge";

// Cincin avatar mengikuti status verifikasi akun:
//   verified   → gradasi warna berputar pelan + glow tipis + lencana centang
//   pending    → cincin kuning polos (tanpa animasi)
//   rejected   → cincin merah lembut
//   unverified → cincin abu-abu redup
// Admin dapat memilih agar gradasi warna-warni hanya untuk akun terverifikasi.
// Hanya lapisan gradasi yang berputar; foto tidak ikut bergerak.
export type AvatarRingStatus = "verified" | "unverified" | "pending" | "rejected";

export default function AvatarRing({
  size = 64,
  src,
  name = "Foto profil",
  status = "unverified",
  gap = "surface",
  priority = false,
  children,
}: {
  size?: number;
  src?: string | null;
  name?: string;
  status?: AvatarRingStatus;
  /** Warna celah 2px: "hero" untuk kartu beranda yang selalu gelap. */
  gap?: "surface" | "hero";
  priority?: boolean;
  children?: ReactNode;
}) {
  const settings = useLevelKyc();
  const rainbowEverywhere = settings ? !settings.kyc.rainbowRingVerifiedOnly : false;
  const outer = size + 8;
  const gapColor = gap === "hero" ? "var(--hero-bg-from)" : "rgb(var(--app-surface))";
  const ring =
    status === "verified" || rainbowEverywhere
      ? "avatar-ring-verified avatar-ring-spin avatar-ring-glow"
      : status === "pending"
        ? "bg-warning"
        : status === "rejected"
          ? "bg-danger-500/45"
          : "bg-app-border";

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-full"
      style={{ width: outer, height: outer }}
    >
      <span aria-hidden className={`absolute inset-0 rounded-full ${ring}`} />
      <span aria-hidden className="absolute inset-[2px] rounded-full" style={{ background: gapColor }} />
      <span className="absolute inset-[4px] overflow-hidden rounded-full bg-app-inset">
        <Image
          src={src || DEFAULT_AVATAR_URL}
          alt={name}
          width={size}
          height={size}
          priority={priority}
          className="h-full w-full object-cover"
        />
      </span>
      {status === "verified" && (
        <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 flex">
          <VerifiedBadge size={size >= 56 ? 26 : size >= 40 ? 20 : 16} />
        </span>
      )}
      {children}
    </span>
  );
}
