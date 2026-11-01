"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import { processAndUploadSettingsAsset } from "@/lib/settings-asset-client";
import type { SettingsAssetKind } from "@/lib/settings-assets";

// Kolom unggah aset pengaturan. Dipakai banner, logo terang/gelap, favicon,
// dan gambar share. Gambar dikompres ke WEBP di browser lalu diunggah lewat
// /api/admin/settings/upload; yang disimpan ke pengaturan hanya URL publik.

export default function SettingsAssetField({
  kind,
  label,
  hint,
  value,
  onChange,
  previewClassName = "h-28 w-28",
}: {
  kind: SettingsAssetKind;
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = kind === "banner" || kind === "og";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await processAndUploadSettingsAsset(file, kind);
      onChange(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mengunggah gambar.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-sm font-bold text-app-text">{label}</p>
      {hint && <p className="mt-0.5 text-xs leading-4 text-app-subtle">{hint}</p>}

      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden rounded-xl border border-app-border bg-app-inset ${previewClassName}`}
        >
          {value ? (
            <Image
              src={value}
              alt={`Pratinjau ${label.toLowerCase()}`}
              fill
              sizes="320px"
              unoptimized
              className={cover ? "object-cover" : "object-contain p-1"}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-[10px] font-bold text-app-subtle">
              Belum ada gambar
            </span>
          )}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              loading={busy}
              onClick={() => inputRef.current?.click()}
            >
              {value ? "Ganti gambar" : "Pilih gambar"}
            </Button>
            {value && !busy && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                Hapus
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-4 text-app-subtle">
            JPG, PNG, atau WEBP · maksimal 2 MB · otomatis dikompres WEBP.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => handleFile(event.target.files?.[0])}
      />
      {error && (
        <p role="alert" className="mt-2 text-xs font-bold text-danger-600 dark:text-danger-400">
          {error}
        </p>
      )}
    </div>
  );
}
