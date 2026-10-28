import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AVATAR_BUCKET, storagePathFromUrl, type AvatarRow } from "@/lib/avatar";

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

const idSchema = z.string().trim().uuid("ID avatar tidak valid.");

const patchSchema = z
  .object({
    is_active: z.boolean().optional(),
    label: z.string().trim().max(60, "Label maksimal 60 karakter.").nullable().optional(),
    move: z.enum(["up", "down"]).optional(),
  })
  .refine((v) => v.is_active !== undefined || v.label !== undefined || v.move, {
    message: "Tidak ada perubahan yang dikirim.",
  });

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ message: "ID avatar tidak valid." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data avatar tidak valid." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: current } = await admin.from("avatars").select("*").eq("id", params.id).maybeSingle();
  if (!current) return NextResponse.json({ message: "Avatar tidak ditemukan." }, { status: 404 });
  const target = current as AvatarRow & { created_at: string };

  if (target.is_default && parsed.data.is_active === false) {
    return NextResponse.json({ message: "Avatar default toko tidak boleh dinonaktifkan." }, { status: 400 });
  }

  if (parsed.data.is_active !== undefined || parsed.data.label !== undefined) {
    const { error } = await admin
      .from("avatars")
      .update({
        ...(parsed.data.is_active === undefined ? {} : { is_active: parsed.data.is_active }),
        ...(parsed.data.label === undefined ? {} : { label: parsed.data.label }),
      })
      .eq("id", target.id);
    if (error) return NextResponse.json({ message: "Gagal memperbarui avatar." }, { status: 500 });
  }

  if (parsed.data.move) {
    const { data: rows } = await admin
      .from("avatars")
      .select("id,sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const ordered = (rows || []) as { id: string; sort_order: number }[];
    const index = ordered.findIndex((r) => r.id === target.id);
    if (index < 0) return NextResponse.json({ message: "Urutan avatar tidak dikenali." }, { status: 500 });
    const swapWith = parsed.data.move === "up" ? index - 1 : index + 1;
    if (swapWith >= 0 && swapWith < ordered.length) {
      const rebuilt = [...ordered];
      const [moved] = rebuilt.splice(index, 1);
      rebuilt.splice(swapWith, 0, moved);
      // Ditulis ulang berjarak 10 agar seri sort_order ikut dinormalisasi.
      for (let i = 0; i < rebuilt.length; i++) {
        const wanted = (i + 1) * 10;
        if (rebuilt[i].sort_order !== wanted) {
          await admin.from("avatars").update({ sort_order: wanted }).eq("id", rebuilt[i].id);
        }
      }
    }
  }

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "avatar.update",
    target_type: "avatar",
    target_id: target.id,
    metadata: {
      is_active: parsed.data.is_active ?? target.is_active,
      label: parsed.data.label ?? target.label,
      move: parsed.data.move ?? null,
    },
  });

  const { data: updated } = await admin
    .from("avatars")
    .select("id,image_url,label,is_active,is_default,sort_order,created_at")
    .eq("id", target.id)
    .maybeSingle();
  return NextResponse.json({ avatar: updated });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  if (!idSchema.safeParse(params.id).success) {
    return NextResponse.json({ message: "ID avatar tidak valid." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("avatars")
    .select("id,image_url,is_default,label")
    .eq("id", params.id)
    .maybeSingle();
  if (!current) return NextResponse.json({ message: "Avatar tidak ditemukan." }, { status: 404 });
  if (current.is_default) {
    return NextResponse.json({ message: "Avatar default toko tidak boleh dihapus." }, { status: 400 });
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("avatar_id", current.id);

  const { error } = await admin.from("avatars").delete().eq("id", current.id);
  if (error) {
    return NextResponse.json(
      { message: (error.message || "").includes("DEFAULT_AVATAR_PROTECTED") ? "Avatar default toko tidak boleh dihapus." : "Gagal menghapus avatar." },
      { status: 500 }
    );
  }

  const objectPath = storagePathFromUrl(String(current.image_url || ""));
  if (objectPath) await admin.storage.from(AVATAR_BUCKET).remove([objectPath]);

  await admin.from("audit_logs").insert({
    actor_id: auth.user!.id,
    action: "avatar.delete",
    target_type: "avatar",
    target_id: current.id,
    metadata: { label: current.label ?? null, affected_users: count ?? 0 },
  });

  return NextResponse.json({ message: "Avatar dihapus.", affected_users: count ?? 0 });
}
