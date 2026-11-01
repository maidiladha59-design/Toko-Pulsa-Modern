import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordSettingAudit } from "@/lib/settings";
import {
  MAX_SETTINGS_ASSET_BYTES,
  SETTINGS_ASSET_BUCKET,
  SETTINGS_ASSET_EXT,
  isSettingsAssetKind,
  sniffSettingsAssetType,
} from "@/lib/settings-assets";

// Unggah aset tema (logo/favicon/OG) dan banner beranda.
//  - Jalur storage sama dengan avatar: Supabase Storage lewat service role,
//    yang disimpan ke database hanya URL publik. Tidak ada base64 dan tidak
//    ada penulisan disk lokal (Vercel).
//  - Tipe file ditentukan dari magic bytes, bukan header MIME kiriman browser.
//  - SVG ditolak karena dapat memuat skrip.

export const dynamic = "force-dynamic";

const PERMISSION = "platform.manage";

async function requireAccess() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }

  const { data: allowed, error: permissionError } = await supabase.rpc("can_admin_permission", {
    p_actor: user.id,
    p_permission: PERMISSION,
  });
  if (permissionError) {
    return { error: NextResponse.json({ message: "Gagal memeriksa izin admin." }, { status: 500 }) };
  }
  if (allowed !== true) {
    return { error: NextResponse.json({ message: "Anda tidak memiliki izin mengunggah aset tema." }, { status: 403 }) };
  }

  return { user: { id: user.id } };
}

export async function POST(request: Request) {
  const access = await requireAccess();
  if ("error" in access) return access.error;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "Unggahan tidak valid." }, { status: 400 });

  const kind = form.get("kind");
  if (!isSettingsAssetKind(kind)) {
    return NextResponse.json({ message: "Jenis aset tidak dikenal." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "Belum ada gambar yang dipilih." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ message: "File kosong." }, { status: 400 });
  }
  if (file.size > MAX_SETTINGS_ASSET_BYTES) {
    return NextResponse.json({ message: "Ukuran gambar maksimal 2 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const realType = sniffSettingsAssetType(bytes);
  if (!realType) {
    return NextResponse.json({ message: "Gambar harus berformat PNG, JPG, atau WEBP." }, { status: 400 });
  }

  const path = `${kind}/${crypto.randomUUID()}.${SETTINGS_ASSET_EXT[realType]}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from(SETTINGS_ASSET_BUCKET).upload(path, bytes, {
    contentType: realType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[settings-upload] unggah storage gagal", {
      kind,
      name: uploadError.name,
      message: uploadError.message,
      statusCode: uploadError.statusCode,
    });
    return NextResponse.json(
      { message: "Gagal mengunggah gambar. Pastikan bucket settings-assets sudah dibuat (migrasi v106)." },
      { status: 500 }
    );
  }

  // getPublicUrl mengembalikan { data: { publicUrl } }.
  const { data: publicData } = admin.storage.from(SETTINGS_ASSET_BUCKET).getPublicUrl(path);
  const url: string = publicData.publicUrl;

  await recordSettingAudit(access.user.id, "settings.asset_upload", kind, {
    kind,
    bytes: bytes.length,
    type: realType,
    path,
  });

  return NextResponse.json({ ok: true, url, kind, bytes: bytes.length, type: realType });
}
