"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { loadActiveAvatars, type AvatarRow } from "@/lib/avatar";
import { useToast } from "@/components/ToastProvider";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import Button from "@/components/ui/Button";
import Icon from "@/components/icons/Icon";
import AvatarRing, { type AvatarRingStatus } from "@/components/profile/AvatarRing";

export default function AvatarPicker({
  open,
  onClose,
  currentAvatarId,
  kycStatus = "unverified",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentAvatarId: string | null;
  /** Cincin pratinjau mengikuti status verifikasi akun, sama seperti di hero. */
  kycStatus?: AvatarRingStatus;
  onSaved?: (payload: { avatar_id: string | null; image_url: string }) => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [items, setItems] = useState<AvatarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(currentAvatarId);
  const [saving, setSaving] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const changed = selected !== currentAvatarId;
  const currentUrl = items.find((item) => item.id === currentAvatarId)?.image_url ?? null;

  useEffect(() => {
    if (!open) return;
    setSelected(currentAvatarId);
    let mounted = true;
    setLoading(true);
    loadActiveAvatars(supabase).then((rows) => {
      if (mounted) { setItems(rows); setLoading(false); }
    });
    return () => { mounted = false; };
  }, [open, supabase, currentAvatarId]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Halaman di bawah sheet tidak boleh ikut bergulir saat pemilih terbuka.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  }, [open]);

  const save = useCallback(async () => {
    if (!changed || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar_id: selected }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        toast.show(json?.message || "Gagal memperbarui foto profil.", "error");
        return;
      }
      onSaved?.({ avatar_id: json.avatar_id ?? null, image_url: json.image_url });
      // Navbar ikut memperbarui foto profil tanpa reload halaman.
      window.dispatchEvent(new CustomEvent("aidil:avatar-updated", { detail: json }));
      toast.show("Foto profil diperbarui.", "success");
      onClose();
    } finally {
      setSaving(false);
    }
  }, [changed, saving, selected, onSaved, onClose, toast]);

  const heading = "Pilih Foto Profil";
  if (!open || typeof document === "undefined") return null;

  // Portal ke document.body: container halaman memakai .animate-page-in yang
  // menahan transform, sehingga position:fixed di dalam hero menjadi relatif
  // terhadap konten (sheet terselip di bawah halaman, overlay tak menutup
  // header dan bottom nav).
  return createPortal(
    <>
      <div className="fixed inset-0 z-[1000] h-[100dvh] w-screen bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-[1001] max-h-[85dvh] w-full overflow-y-auto rounded-t-[20px] border-t border-app-border bg-app-surface p-5 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_-18px_45px_rgba(0,0,0,.45)] outline-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-black text-app-text">{heading}</h2>
          <button onClick={onClose} aria-label="Tutup" className="shrink-0 rounded-lg px-2 py-1 leading-none text-app-muted transition hover:bg-app-inset hover:text-app-text"><Icon name="close" size={18} /></button>
        </div>

        {!loading && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-app-border bg-app-inset p-3">
            <AvatarRing size={40} src={currentUrl} status={kycStatus} name="Foto profil saat ini" />
            <div className="min-w-0">
              <p className="text-xs font-bold text-app-text">Foto saat ini</p>
              <p className="truncate text-[11px] text-app-muted">Ketuk foto lain di bawah, lalu simpan.</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-4 grid grid-cols-3 gap-3 p-1.5">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-app-border bg-app-inset p-6 text-center">
            <p className="text-sm font-bold text-app-text">Belum ada foto profil tersedia</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">Admin dapat menambahkannya lewat Panel Admin <span className="inline-flex items-center gap-1"><Icon name="chevron_right" size={14} />Foto Profil.</span></p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3 p-1.5">
            {items.map((a) => {
              const active = a.id === selected;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a.id)}
                  aria-pressed={active}
                  className={`relative aspect-square overflow-hidden rounded-full transition ${
                    active ? "ring-4 ring-gold-400 ring-offset-0" : "ring-1 ring-app-border hover:ring-gold-400/50"
                  }`}
                >
                  <Image src={a.image_url} alt={a.label || "Avatar"} width={140} height={140} className="h-full w-full object-cover" />
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 font-black text-zinc-950"><Icon name="check" size={16} /></span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1 py-3">Batal</Button>
          <Button onClick={save} disabled={!changed} loading={saving} className="flex-1 py-3">Simpan</Button>
        </div>
      </div>
    </>,
    document.body
  );
}
