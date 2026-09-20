"use client";
// Perkiraan ketajaman gambar (varians Laplacian) yang dihitung di browser,
// dipakai untuk menolak otomatis foto KTP/selfie yang blur sebelum dikirim ke server.

const BLUR_VARIANCE_THRESHOLD = 45; // semakin kecil nilai varians, semakin blur gambarnya

export async function measureSharpness(file: File): Promise<number> {
  const bitmap = await loadImage(file);
  const maxSize = 480;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return Infinity; // kalau canvas tidak tersedia, jangan blokir user

  ctx.drawImage(bitmap as any, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  // grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  // konvolusi kernel Laplacian 3x3 lalu hitung varians hasilnya
  const lap = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const val =
        4 * gray[idx] -
        gray[idx - 1] -
        gray[idx + 1] -
        gray[idx - w] -
        gray[idx + w];
      lap[idx] = val;
    }
  }

  let sum = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      sum += lap[y * w + x];
      count++;
    }
  }
  const mean = count ? sum / count : 0;
  let variance = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const d = lap[y * w + x] - mean;
      variance += d * d;
    }
  }
  variance = count ? variance / count : 0;
  return variance;
}

export async function isImageTooBlurry(file: File): Promise<boolean> {
  try {
    const score = await measureSharpness(file);
    return score < BLUR_VARIANCE_THRESHOLD;
  } catch {
    return false; // gagal menganalisis -> jangan blokir, biar admin yang periksa manual
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
