"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { loadActiveAvatars, type AvatarRow } from "@/lib/avatar";
import { useToast } from "@/components/ToastProvider";
import { Skeleton } from "@/components/ui/LoadingSkeleton";
import Button from "@/components/ui/Button";

export default function AvatarPicker({
  open,
  onClose,
  currentAvatarId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentAvatarId: string | null;
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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={heading}
      tabIndex={-1}
      ref={dialogRef}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-3xl border border-app-border bg-app-surface p-5 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-black text-app-text">{heading}</h2>
          <button onClick={onClose} aria-label="Tutup" className="shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-app-muted transition hover:bg-app-inset hover:text-app-text">✕</button>
        </div>

        {loading ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-full" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-app-border bg-app-inset p-6 text-center">
            <p className="text-sm font-bold text-app-text">Belum ada foto profil tersedia</p>
            <p className="mt-1 text-xs leading-5 text-app-muted">Admin dapat menambahkannya lewat Panel Admin ▸ Foto Profil.</p>
          </div>
        ) : (
          <div className="mt-4 grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto">
            {items.map((a) => {
              const active = a.id === selected;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelected(a.id)}
                  aria-pressed={active}
                  className={`relative aspect-square overflow-hidden rounded-full transition ${
                    active ? "ring-4 ring-gold-400 ring-offset-2 ring-offset-app-surface" : "ring-1 ring-app-border hover:ring-gold-400/50"
                  }`}
                >
                  <Image src={a.image_url} alt={a.label || "Avatar"} width={140} height={140} className="h-full w-full object-cover" />
                  {active && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold-400 text-sm font-black text-zinc-950">✓</span>
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
    </div>
  );
}
