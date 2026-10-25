import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireManualTopupAdmin } from "@/lib/manual-topup-admin";
import {
  MANUAL_PROOF_EXTENSIONS,
  MANUAL_PROOF_MAX_BYTES,
  MANUAL_PROOF_MIME_TYPES,
  MANUAL_QRIS_BUCKET,
} from "@/lib/manual-topup";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireManualTopupAdmin();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "File gambar QRIS tidak ditemukan." }, { status: 400 });
  }
  if (!(MANUAL_PROOF_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json(
      { message: "Format gambar QRIS harus JPG, PNG, atau WEBP." },
      { status: 400 }
    );
  }
  if (file.size <= 0 || file.size > MANUAL_PROOF_MAX_BYTES) {
    return NextResponse.json(
      { message: "Ukuran gambar QRIS maksimal 5MB. Kompres file lalu coba lagi." },
      { status: 400 }
    );
  }

  const extension = MANUAL_PROOF_EXTENSIONS[file.type];
  const path = `qris/${crypto.randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const upload = await admin.storage
    .from(MANUAL_QRIS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (upload.error) {
    console.error("[manual-topup-admin] upload QRIS gagal", JSON.stringify({
      bucket: MANUAL_QRIS_BUCKET,
      code: upload.error.message?.includes("Bucket not found") ? "BUCKET_NOT_FOUND" : "UPLOAD_FAILED",
    }));
    return NextResponse.json(
      { message: "Gagal mengunggah gambar QRIS. Pastikan bucket qris-images sudah dibuat (migrasi v93)." },
      { status: 503 }
    );
  }

  const { data } = admin.storage.from(MANUAL_QRIS_BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl, path }, { status: 201 });
}
