import type { ReactNode } from "react";
import Image from "next/image";
import { DEFAULT_AVATAR_URL } from "@/lib/avatar";

// Cincin avatar mengikuti status verifikasi akun:
//   verified   → gradasi warna berputar pelan + glow tipis + lencana centang
//   pending    → cincin kuning polos (tanpa animasi)
//   rejected   → cincin merah lembut
//   unverified → cincin abu-abu redup
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
  const outer = size + 8;
  const gapColor = gap === "hero" ? "rgb(var(--app-hero-bg))" : "rgb(var(--app-surface))";
  const ring =
    status === "verified"
      ? "avatar-ring-verified avatar-ring-spin avatar-ring-glow"
      : status === "pending"
        ? "bg-warning"
        : status === "rejected"
          ? "bg-danger-500/45"
          : "bg-app-border";

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
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
        <span
          role="img"
          aria-label="Terverifikasi"
          className="absolute bottom-0 left-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-success-500 text-white"
          style={{ boxShadow: `0 0 0 2px ${gapColor}` }}
        >
          <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
            <path
              d="M2.4 6.2 4.8 8.5 9.6 3.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
      {children}
    </span>
  );
}
