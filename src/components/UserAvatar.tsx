import Image from "next/image";
import { DEFAULT_AVATAR_URL } from "@/lib/avatar";

// Foto profil pengguna yang dipakai ulang di hero beranda, Navbar, halaman
// Profil, dan pemilih avatar. Ukuran dirender tetap (width/height + kelas
// sizing) supaya tidak ada layout shift saat gambar belum selesai dimuat.
export default function UserAvatar({
  size = 60,
  src,
  fallback = DEFAULT_AVATAR_URL,
  name = "Foto profil",
  ring = true,
  className = "",
  priority = false,
}: {
  size?: number;
  src?: string | null;
  fallback?: string;
  name?: string;
  ring?: boolean;
  className?: string;
  priority?: boolean;
}) {
  const px = `${size}px`;
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-app-inset ${
        ring ? "ring-2 ring-gold-400/70 ring-offset-2 ring-offset-transparent" : ""
      } ${className}`}
      style={{ width: px, height: px }}
    >
      <Image
        src={src || fallback}
        alt={name}
        width={size}
        height={size}
        priority={priority}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
