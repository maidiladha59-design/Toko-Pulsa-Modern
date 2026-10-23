import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["ACTIVE", "BLOCKED"]),
  reason: z.string().trim().max(500).optional().nullable(),
});

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Silakan login kembali.",
  ADMIN_ONLY: "Akses admin ditolak.",
  ADMIN_MISMATCH: "Sesi admin tidak valid. Muat ulang halaman.",
  INVALID_STATUS: "Status akun tidak valid.",
  REASON_REQUIRED: "Alasan blokir wajib diisi (minimal 5 karakter).",
  USER_NOT_FOUND: "Pengguna tidak ditemukan.",
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });

  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!actor || !["ADMIN", "SUPER_ADMIN", "STAFF"].includes(String(actor.role))) {
    return NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: "Data status akun tidak valid." }, { status: 400 });
  }

  if (parsed.data.status === "BLOCKED" && (parsed.data.reason || "").trim().length < 5) {
    return NextResponse.json({ message: "Alasan blokir wajib diisi minimal 5 karakter." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("admin_set_user_status", {
    p_admin_id: user.id,
    p_target_user_id: params.id,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason?.trim() || null,
  });

  if (error) {
    const code = String(error.message || "");
    return NextResponse.json(
      { message: ERROR_MESSAGES[code] || "Gagal memperbarui status akun. Silakan coba lagi.", code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
