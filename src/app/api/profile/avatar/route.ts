import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_AVATAR_URL } from "@/lib/avatar";

const bodySchema = z.object({
  avatar_id: z.string().trim().uuid("Avatar tidak valid.").nullable(),
});

const RPC_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: "Sesi kamu berakhir. Silakan login ulang.",
  AVATAR_NOT_AVAILABLE: "Foto profil tidak tersedia. Pilih avatar lain.",
  PROFILE_NOT_FOUND: "Data profil tidak ditemukan.",
};

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data foto profil tidak valid." },
      { status: 400 }
    );
  }

  // RPC security definer: memaksa avatar ada & aktif, dan hanya menulis ke
  // baris profiles milik auth.uid() — bukan milik user lain.
  const { data, error } = await supabase.rpc("user_set_avatar", {
    p_avatar_id: parsed.data.avatar_id,
  });

  if (error) {
    const raw = error.message || "";
    const key = Object.keys(RPC_MESSAGES).find((code) => raw.includes(code));
    return NextResponse.json(
      { message: key ? RPC_MESSAGES[key] : "Gagal memperbarui foto profil." },
      { status: key ? 400 : 500 }
    );
  }

  const result = (data || {}) as { avatar_id?: string | null; image_url?: string | null };
  return NextResponse.json({
    ok: true,
    avatar_id: result.avatar_id ?? null,
    image_url: result.image_url || DEFAULT_AVATAR_URL,
  });
}
