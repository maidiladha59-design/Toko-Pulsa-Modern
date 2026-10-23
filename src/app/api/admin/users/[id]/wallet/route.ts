import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  direction: z.enum(["CREDIT", "DEBIT"]),
  amount: z.number().int().positive().max(1_000_000_000_000),
  reason: z.string().trim().min(5, "Alasan wajib diisi minimal 5 karakter.").max(500),
});

const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Silakan login kembali.",
  ADMIN_ONLY: "Akses admin ditolak.",
  ADMIN_MISMATCH: "Sesi admin tidak valid. Muat ulang halaman.",
  INVALID_AMOUNT: "Nominal harus lebih dari 0.",
  INVALID_DIRECTION: "Arah penyesuaian saldo tidak valid.",
  REASON_REQUIRED: "Alasan penyesuaian wajib diisi (minimal 5 karakter).",
  INSUFFICIENT_BALANCE: "Saldo pengguna tidak mencukupi untuk pengurangan ini.",
  USER_NOT_FOUND: "Pengguna tidak ditemukan.",
  ACCOUNT_BLOCKED: "Akun ini sedang diblokir.",
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
    const first = parsed.error.issues[0]?.message;
    return NextResponse.json({ message: first || "Data penyesuaian saldo tidak valid." }, { status: 400 });
  }

  // RPC dijalankan dengan sesi admin (bukan service role) supaya auth.uid()
  // di dalam database tetap berisi admin yang sedang login.
  const { data, error } = await supabase.rpc("admin_adjust_user_balance", {
    p_admin_id: user.id,
    p_target_user_id: params.id,
    p_amount: parsed.data.amount,
    p_direction: parsed.data.direction,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const code = String(error.message || "");
    return NextResponse.json(
      { message: ERROR_MESSAGES[code] || "Gagal menyesuaikan saldo. Silakan coba lagi.", code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, result: data });
}
