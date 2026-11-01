import { z } from "zod";

// Primitif validasi pengaturan. File ini murni (tanpa React/Next/Supabase)
// supaya bisa dipakai skema di server, API route, maupun komponen client.
//
// Aturan keamanan yang berlaku untuk SEMUA pengaturan terkelola:
//  - Teks admin selalu teks biasa; tidak pernah dirender sebagai HTML.
//  - URL hanya path internal (diawali "/") atau https.
//  - Warna hanya hex CSS yang valid.

export function isInternalPathOrHttps(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/")) return !/[\\\u0000-\u001F]/.test(value);
  return /^https:\/\/[^\s]+$/i.test(value);
}

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, {
    message: "Warna harus format hex, contoh #2E9EF5.",
  });

export function plainTextSchema(max = 2000) {
  return z
    .string()
    .trim()
    .max(max, { message: `Teks maksimal ${max} karakter.` })
    .refine((value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value), {
      message: "Teks mengandung karakter yang tidak diizinkan.",
    });
}

export const internalPathOrHttpsSchema = z
  .string()
  .trim()
  .min(1, { message: "URL wajib diisi." })
  .max(500, { message: "URL maksimal 500 karakter." })
  .refine(isInternalPathOrHttps, {
    message: "URL hanya boleh path internal (diawali /) atau https.",
  });

export const optionalInternalPathOrHttpsSchema = z
  .string()
  .trim()
  .max(500, { message: "URL maksimal 500 karakter." })
  .refine((value) => value === "" || isInternalPathOrHttps(value), {
    message: "URL hanya boleh path internal (diawali /) atau https.",
  });

/** Aset yang diunggah boleh berupa URL storage https atau path internal. */
export const assetUrlSchema = optionalInternalPathOrHttpsSchema;
