import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AVATAR_BUCKET,
  MAX_AVATAR_BYTES,
  MAX_AVATAR_UPLOAD_TOTAL_BYTES,
  AVATAR_TYPES,
  sniffAvatarType,
  type AvatarRow,
} from "@/lib/avatar";

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const labelSchema = z.string().trim().max(60, "Label maksimal 60 karakter.");

async function requireAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }
  return { user };
}

// Jumlah pengguna yang sedang memakai tiap avatar (dipakai saat konfirmasi hapus).
async function usageByAvatar(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from("profiles").select("avatar_id");
  const counts = new Map<string, number>();
  for (const row of data || []) {
    const id = row.avatar_id as string | null;
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("avatars")
    .select("id,image_url,label,is_active,is_default,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[avatars] baca koleksi avatar gagal", { code: error.code, message: error.message, details: error.details });
    return NextResponse.json(
      { message: "Koleksi foto profil belum tersedia. Pastikan migrasi v97 sudah dijalankan." },
      { status: 500 }
    );
  }

  const usage = await usageByAvatar(admin);
  const avatars = ((data || []) as AvatarRow[]).map((a) => ({ ...a, usage_count: usage.get(a.id) || 0 }));
  return NextResponse.json({ avatars });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ message: "Unggahan tidak valid." }, { status: 400 });

  const labelResult = labelSchema.safeParse(String(form.get("label") || ""));
  if (!labelResult.success) {
    return NextResponse.json({ message: labelResult.error.issues[0]?.message }, { status: 400 });
  }
  const label = labelResult.data || null;

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ message: "Belum ada gambar yang dipilih." }, { status: 400 });
  if (files.length > 12) return NextResponse.json({ message: "Maksimal 12 avatar per unggahan." }, { status: 400 });

  const admin = createAdminClient();
  const { data: last, error: orderError } = await admin
    .from("avatars")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) console.error("[avatars] gagal membaca sort_order terakhir", orderError);
  let nextOrder = Number(last?.sort_order || 0) + 10;

  const created: AvatarRow[] = [];
  const rejected: string[] = [];
  let totalBytes = 0;

  for (const file of files) {
    if (file.size === 0) { rejected.push(`${file.name}: file kosong.`); continue; }
    if (file.size > MAX_AVATAR_BYTES) { rejected.push(`${file.name}: melebihi 1MB.`); continue; }
    if (totalBytes + file.size > MAX_AVATAR_UPLOAD_TOTAL_BYTES) {
      rejected.push(`${file.name}: total unggahan melebihi 4MB.`);
      continue;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const realType = sniffAvatarType(bytes);
    if (!realType || !AVATAR_TYPES.includes(realType)) {
      rejected.push(`${file.name}: hanya PNG, JPG, atau WEBP.`);
      continue;
    }
    totalBytes += bytes.length;

    const id = crypto.randomUUID();
    const path = `${id}.${EXT_BY_TYPE[realType]}`;
    const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(path, bytes, {
      contentType: realType,
      upsert: false,
    });
    if (uploadError) {
      console.error("[avatars] unggah storage gagal", {
        file: file.name,
        name: uploadError.name,
        message: uploadError.message,
        statusCode: uploadError.statusCode,
      });
      rejected.push(`${file.name}: gagal mengunggah ke storage.`);
      continue;
    }

    // getPublicUrl mengembalikan { data: { publicUrl } } — mengambil `data` saja
    // akan menyimpan objek JSON dan ditolak constraint avatars_image_url_format.
    const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const imageUrl: string = publicData.publicUrl;

    const { data: row, error: insertError } = await admin
      .from("avatars")
      .insert({
        id,
        image_url: imageUrl,
        label,
        is_active: true,
        is_default: false,
        sort_order: nextOrder,
        created_by: auth.user!.id,
      })
      .select("id,image_url,label,is_active,is_default,sort_order,created_at")
      .single();
    if (insertError || !row) {
      console.error("[avatars] simpan baris avatar gagal", {
        file: file.name,
        id,
        image_url: imageUrl,
        code: insertError?.code,
        message: insertError?.message,
        details: insertError?.details,
        hint: insertError?.hint,
      });
      await admin.storage.from(AVATAR_BUCKET).remove([path]);
      rejected.push(`${file.name}: gagal menyimpan data avatar.`);
      continue;
    }

    nextOrder += 10;
    created.push(row as AvatarRow);
  }

  if (created.length > 0) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      actor_id: auth.user!.id,
      action: "avatar.create",
      target_type: "avatar",
      metadata: { count: created.length, ids: created.map((c) => c.id), label },
    });
    if (auditError) console.error("[avatars] audit log gagal", { code: auditError.code, message: auditError.message, details: auditError.details });
  }

  if (created.length === 0) {
    return NextResponse.json(
      { message: rejected.join(" ") || "Gagal menyimpan avatar. Pastikan bucket avatars sudah dibuat (migrasi v97)." },
      { status: 400 }
    );
  }

  return NextResponse.json({ avatars: created, rejected });
}
