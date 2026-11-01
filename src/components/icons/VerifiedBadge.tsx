import { VERIFIED_CHECK_PATH, VERIFIED_SEAL_PATH } from "./verified-path";

export type VerifiedBadgeProps = {
  size?: number;
  className?: string;
  /** Warna isi seal. Default mengikuti token sukses tema (terang & gelap). */
  color?: string;
  /** Outline tipis pemisah dari cincin avatar atau latar gelap. */
  outline?: string;
};

/**
 * Lencana akun terverifikasi: seal bergelombang dengan centang putih.
 * Hanya dipakai untuk status VERIFIED; status lain tetap memakai ikon lama.
 */
export default function VerifiedBadge({
  size = 20,
  className = "",
  color = "var(--success)",
  outline = "var(--card)",
}: VerifiedBadgeProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Akun terverifikasi"
      focusable="false"
      shapeRendering="geometricPrecision"
      className={`verified-badge-pop inline-block shrink-0 align-middle ${className}`}
    >
      <path d={VERIFIED_SEAL_PATH} fill={color} stroke={outline} strokeWidth={1.5} strokeLinejoin="round" />
      {/* Putih tetap literal: centang harus terbaca di atas warna sukses apa pun. */}
      <path
        d={VERIFIED_CHECK_PATH}
        fill="none"
        stroke="white"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
