import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { clearAllCaches, recordSystemAudit } from "@/lib/settings";

// Alat sistem: bersihkan cache tag pengaturan, katalog, dan banner.
// Hanya boleh dari sesi admin dengan permission platform.manage; konfirmasi
// wajib dikirim eksplisit dan setiap pembersihan dicatat di audit_logs.

export const dynamic = "force-dynamic";

const bodySchema = z.object({ confirm: z.literal(true) }).strict();

async function requireOperator() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ message: "Silakan login kembali." }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !["ADMIN", "SUPER_ADMIN"].includes(String(profile.role))) {
    return { error: NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 }) };
  }

  const { data: allowed, error } = await supabase.rpc("can_admin_permission", {
    p_actor: user.id,
    p_permission: "platform.manage",
  });
  if (error) {
    return { error: NextResponse.json({ message: "Gagal memeriksa izin admin." }, { status: 500 }) };
  }
  if (allowed !== true) {
    return {
      error: NextResponse.json(
        { message: "Anda tidak memiliki izin platform.manage untuk membersihkan cache." },
        { status: 403 }
      ),
    };
  }

  return { user };
}

export async function POST(request: Request) {
  const access = await requireOperator();
  if ("error" in access) return access.error;

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Konfirmasi wajib dicentang sebelum membersihkan cache." },
      { status: 400 }
    );
  }

  const tags = clearAllCaches();
  const clearedAt = new Date().toISOString();

  await recordSystemAudit(access.user.id, "system.cache_clear", {
    tags,
    cleared_at: clearedAt,
  });

  return NextResponse.json({ ok: true, tags, cleared_at: clearedAt });
}
