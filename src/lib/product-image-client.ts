"use client";

import {
  MAX_PRODUCT_IMAGE_INPUT_BYTES,
  PRODUCT_IMAGE_QUALITY,
  PRODUCT_IMAGE_SIZE,
  PRODUCT_IMAGE_TYPES,
  type ProductImageType,
} from "@/lib/product-image";

type Drawable = ImageBitmap | HTMLImageElement;

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
    // Beri waktu drawImage selesai sebelum URL dilepas.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return image;
}

function toWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Gagal mengompres gambar. Coba file lain."))),
      "image/webp",
      PRODUCT_IMAGE_QUALITY
    );
  });
}

// Crop tengah 1:1, resize 512x512, kompres WEBP kualitas ~80.
export async function compressProductImage(file: File): Promise<File> {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type as ProductImageType)) {
    throw new Error("Gambar harus berformat JPG, PNG, atau WEBP.");
  }
  if (file.size > MAX_PRODUCT_IMAGE_INPUT_BYTES) {
    throw new Error("Ukuran gambar maksimal 2 MB.");
  }

  const drawable = await loadDrawable(file);
  const width = "width" in drawable ? drawable.width : 0;
  const height = "height" in drawable ? drawable.height : 0;
  if (!width || !height) throw new Error("Gambar tidak dapat dibaca. Coba file lain.");

  const side = Math.min(width, height);
  const sx = (width - side) / 2;
  const sy = (height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = PRODUCT_IMAGE_SIZE;
  canvas.height = PRODUCT_IMAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(drawable, sx, sy, side, side, 0, 0, PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE);
  if (typeof ImageBitmap !== "undefined" && drawable instanceof ImageBitmap) drawable.close();

  const blob = await toWebp(canvas);
  const base =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 40) || "gambar";
  return new File([blob], `${base}.webp`, { type: "image/webp", lastModified: Date.now() });
}
