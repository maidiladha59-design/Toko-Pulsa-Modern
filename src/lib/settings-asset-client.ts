"use client";

import {
  MAX_SETTINGS_ASSET_BYTES,
  SETTINGS_ASSET_TYPES,
  type SettingsAssetKind,
  type SettingsAssetType,
} from "@/lib/settings-assets";

// Pemrosesan gambar di browser sebelum diunggah:
//  - banner dipotong tengah 16:7, OG 1200x630, logo/favicon diskalakan utuh
//    (tidak dipotong agar teks logo tidak terpangkas; latar transparan dijaga),
//  - semua hasil dikompres WEBP <= 2 MB,
//  - server tetap memeriksa magic bytes dan ukuran; pemeriksaan di sini hanya
//    agar admin mendapat pesan cepat.

type Target = { width: number; height: number; mode: "cover" | "contain" };
type Drawable = ImageBitmap | HTMLImageElement;

const TARGETS: Record<SettingsAssetKind, Target> = {
  banner: { width: 1280, height: 560, mode: "cover" },
  "logo-light": { width: 512, height: 512, mode: "contain" },
  "logo-dark": { width: 512, height: 512, mode: "contain" },
  favicon: { width: 256, height: 256, mode: "contain" },
  og: { width: 1200, height: 630, mode: "cover" },
  operator: { width: 512, height: 512, mode: "contain" },
};

const QUALITY = 0.86;

async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* Safari lama / format tertentu: fallback ke <img>. */
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return image;
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal mengompres gambar. Coba file lain."))),
      "image/webp",
      QUALITY
    );
  });
}

export async function prepareSettingsAsset(file: File, kind: SettingsAssetKind): Promise<File> {
  if (!SETTINGS_ASSET_TYPES.includes(file.type as SettingsAssetType)) {
    throw new Error("Gambar harus berformat JPG, PNG, atau WEBP.");
  }
  if (file.size > MAX_SETTINGS_ASSET_BYTES) {
    throw new Error("Ukuran gambar maksimal 2 MB.");
  }

  const target = TARGETS[kind];
  const drawable = await loadDrawable(file);
  const width = "width" in drawable ? drawable.width : 0;
  const height = "height" in drawable ? drawable.height : 0;
  if (!width || !height) throw new Error("Gambar tidak dapat dibaca. Coba file lain.");

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  if (target.mode === "cover") {
    const scale = Math.max(target.width / width, target.height / height);
    const sourceWidth = target.width / scale;
    const sourceHeight = target.height / scale;
    const sx = (width - sourceWidth) / 2;
    const sy = (height - sourceHeight) / 2;
    context.drawImage(drawable, sx, sy, sourceWidth, sourceHeight, 0, 0, target.width, target.height);
  } else {
    const scale = Math.min(target.width / width, target.height / height, 1);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    context.drawImage(
      drawable,
      (target.width - drawWidth) / 2,
      (target.height - drawHeight) / 2,
      drawWidth,
      drawHeight
    );
  }

  if (typeof ImageBitmap !== "undefined" && drawable instanceof ImageBitmap) drawable.close();

  const blob = await toWebp(canvas);
  if (blob.size > MAX_SETTINGS_ASSET_BYTES) {
    throw new Error("Hasil kompresi melebihi 2 MB. Gunakan gambar dengan detail lebih sedikit.");
  }
  return new File([blob], `${kind}.webp`, { type: "image/webp", lastModified: Date.now() });
}

export async function uploadSettingsAsset(file: File, kind: SettingsAssetKind): Promise<string> {
  const form = new FormData();
  form.append("kind", kind);
  form.append("file", file);

  const response = await fetch("/api/admin/settings/upload", { method: "POST", body: form });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.url) {
    throw new Error(json?.message || "Gagal mengunggah gambar. Coba lagi.");
  }
  return String(json.url);
}

/** Satu langkah untuk admin: kompres lalu unggah, hasilnya URL publik. */
export async function processAndUploadSettingsAsset(file: File, kind: SettingsAssetKind): Promise<string> {
  const prepared = await prepareSettingsAsset(file, kind);
  return uploadSettingsAsset(prepared, kind);
}
