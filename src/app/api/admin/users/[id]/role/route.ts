import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ role: z.enum(["USER", "ADMIN", "SUPER_ADMIN"]) });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Silakan login kembali." }, { status: 401 });
  const { data: actor } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!actor || !["ADMIN", "SUPER_ADMIN"].includes(actor.role)) return NextResponse.json({ message: "Akses admin ditolak." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Role tidak valid." }, { status: 400 });
  if (params.id === user.id && parsed.data.role !== actor.role) return NextResponse.json({ message: "Jangan mengubah role akun admin yang sedang dipakai." }, { status: 400 });
  if (actor.role !== "SUPER_ADMIN" && parsed.data.role === "SUPER_ADMIN") return NextResponse.json({ message: "Hanya SUPER_ADMIN yang dapat memberi role SUPER_ADMIN." }, { status: 403 });
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role: parsed.data.role, updated_at: new Date().toISOString() }).eq("id", params.id);
  if (error) return NextResponse.json({ message: "Gagal mengubah role pengguna." }, { status: 500 });
  await admin.from("audit_logs").insert({ actor_id: user.id, action: "user.role_update", target_type: "profile", target_id: params.id, metadata: { role: parsed.data.role } });
  return NextResponse.json({ message: "Role pengguna berhasil diperbarui." });
}
