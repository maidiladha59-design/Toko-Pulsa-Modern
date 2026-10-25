import { NextResponse } from "next/server";
import { requireCommunityChatAdmin } from "@/lib/community-chat-admin";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireCommunityChatAdmin();
  if (auth.error) return auth.error;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("chat_user_status")
    .select("user_id,is_muted,muted_reason,muted_at")
    .eq("is_muted", true)
    .order("muted_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      {
        message:
          "Data pengguna dibisukan belum tersedia. Pastikan migrasi v94 sudah dijalankan di Supabase.",
      },
      { status: 500 }
    );
  }

  const mutedRows = rows || [];
  const userIds = [...new Set(mutedRows.map((row) => row.user_id))];
  const profilesById = new Map<string, { full_name: string | null; email: string | null }>();

  if (userIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);

    for (const profile of profiles || []) {
      profilesById.set(profile.id, {
        full_name: profile.full_name,
        email: profile.email,
      });
    }
  }

  return NextResponse.json({
    users: mutedRows.map((row) => {
      const profile = profilesById.get(row.user_id);
      return {
        user_id: row.user_id,
        name: profile?.full_name || profile?.email?.split("@")[0] || "Pengguna",
        email: profile?.email || null,
        reason: row.muted_reason,
        muted_at: row.muted_at,
      };
    }),
  });
}
