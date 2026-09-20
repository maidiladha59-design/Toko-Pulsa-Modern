import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ocrKtp } from "@/lib/ktp-ocr";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Dipanggil dari halaman KYC Tahap 1 (KTP), sebelum foto disimpan, sebagai
 * pengecekan tambahan di luar cek blur: apakah foto ini terbaca seperti KTP
 * (pola NIK 16 digit / kata kunci KTP). Ini BUKAN verifikasi keaslian resmi —
 * lihat catatan lengkap di src/lib/ktp-ocr.ts.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login terlebih dahulu." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ message: "File KTP tidak ditemukan." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ message: "Ukuran file terlalu besar." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await ocrKtp(buffer);

  return NextResponse.json({ ok: result.ok, looksLikeKtp: result.looksLikeKtp, nik: result.nik });
}
