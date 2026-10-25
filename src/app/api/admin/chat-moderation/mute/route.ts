import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCommunityChatAdmin } from "@/lib/community-chat-admin";
import {
  COMMUNITY_CHAT_ADMIN_ERRORS,
  chatAdminErrorMessage,
} from "@/lib/community-chat";

const bodySchema = z.object({
  user_id: z.string().uuid("ID pengguna tidak valid."),
  muted: z.boolean(),
  reason: z.string().trim().max(500, "Alasan terlalu panjang (maksimal 500 karakter).").nullable().optional(),
});

function errorCode(message: string) {
  const raw = String(message || "");
  return Object.keys(COMMUNITY_CHAT_ADMIN_ERRORS).find((code) => raw.includes(code)) || "";
}

export async function POST(request: Request) {
  const auth = await requireCommunityChatAdmin();
  if (auth.error) return auth.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message || "Data moderasi tidak valid." },
      { status: 400 }
    );
  }

  const reason = (parsed.data.reason || "").trim();
  if (parsed.data.muted && !reason) {
    return NextResponse.json(
      { message: "Alasan wajib diisi saat membisukan pengguna.", code: "REASON_REQUIRED" },
      { status: 400 }
    );
  }

  const { error } = await auth.supabase.rpc("admin_set_chat_mute", {
    p_admin_id: auth.user.id,
    p_target_user_id: parsed.data.user_id,
    p_muted: parsed.data.muted,
    p_reason: parsed.data.muted ? reason : null,
  });

  if (error) {
    const code = errorCode(error.message);
    if (!code && /function|schema cache/i.test(error.message)) {
      return NextResponse.json(
        { message: "Fitur moderasi belum tersedia. Pastikan migrasi v94 sudah dijalankan." },
        { status: 500 }
      );
    }
    console.error("[community-chat-admin] moderasi bisu gagal", JSON.stringify({ code: code || "UNKNOWN" }));
    return NextResponse.json(
      {
        message: code
          ? chatAdminErrorMessage(code)
          : "Aksi moderasi gagal. Silakan coba lagi.",
        code: code || "ACTION_FAILED",
      },
      { status: code === "USER_NOT_FOUND" ? 404 : code === "ADMIN_ONLY" ? 403 : 400 }
    );
  }

  return NextResponse.json({ ok: true, muted: parsed.data.muted });
}
