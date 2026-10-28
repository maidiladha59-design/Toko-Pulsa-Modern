"use client";

import { useState } from "react";
import UserAvatar from "@/components/UserAvatar";
import AvatarPicker from "@/components/AvatarPicker";

// Blok pembuka hero beranda: foto profil + nama pengguna yang sedang login.
// Menggantikan logo + tagline lama. Seluruh kolom teks diberi min-w-0 agar
// nama panjang terpotong ellipsis di dalam kartu, bukan melebarkan hero.
export default function HeroUser({
  name,
  avatarId,
  avatarUrl,
}: {
  name: string;
  avatarId: string | null;
  avatarUrl: string | null;
}) {
  const [current, setCurrent] = useState({ id: avatarId, url: avatarUrl });
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        aria-label="Ganti foto profil"
        className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-2xl py-1 text-left transition hover:opacity-90"
      >
        <span className="relative min-w-0 shrink-0">
          <UserAvatar size={60} src={current.url} name={name} priority />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-gold-400/60 bg-zinc-900 text-[11px] text-gold-200 shadow-sm"
          >
            ✎
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gold-200">Halo,</span>
          <span className="block truncate text-[18px] font-semibold leading-6 text-white">{name}</span>
        </span>
      </button>
      <AvatarPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        currentAvatarId={current.id}
        onSaved={({ avatar_id, image_url }) => setCurrent({ id: avatar_id, url: image_url })}
      />
    </>
  );
}
